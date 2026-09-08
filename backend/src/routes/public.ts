import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MOCK_PROPERTIES } from '../lib/mockProperties.js';
import { mockTickets } from '../lib/mockMaintenance.js';
import { createMockBooking, createMockQuote } from '../lib/mockBookings.js';
import { mockLegalRequests, createMockLegalQuote } from '../lib/mockLegal.js';
import { NIGERIA_STATES, stateBySlug } from '../lib/nigeriaStates.js';
import { notifyOps } from '../lib/notifyOps.js';
import { pushQuotation, pushHandymanVisitBooking, pushPropertyViewingBooking } from '../services/sharepoint.js';
import { TRADES, isTradeId, tradeLabel, type TradeId } from '../lib/trades.js';
import { computeArtisanScore, bayesianRating } from '../lib/artisanScore.js';
import { mockArtisans } from '../lib/mockArtisans.js';
import { createMockLead } from '../lib/mockArtisanLeads.js';

// Everything in this file is unauthenticated — it's what the public
// marketing site (properties page, handyman marketplace page) talks to.
export const publicRouter = Router();

// ---- Property listings --------------------------------------------------

// ---- Nigeria states -------------------------------------------------------

// Drives the state filter/dropdown on the marketing site (properties,
// artisans, landlord signup) — counts let the UI show "Lagos (24)" etc.
publicRouter.get('/public/states', async (_req, res) => {
  if (env.mockMode) {
    const jobs = mockTickets.filter((t) => t.openToMarketplace && t.status !== 'RESOLVED');
    const states = NIGERIA_STATES.map((s) => ({
      name: s.name,
      slug: s.slug,
      propertyCount: MOCK_PROPERTIES.filter((p) => p.isAdvertised && p.state === s.name).length,
      jobCount: jobs.filter((j) => j.state === s.name).length,
    }));
    return res.json(states);
  }
  const [propertyCounts, jobCounts] = await Promise.all([
    prisma.property.groupBy({ by: ['state'], where: { isAdvertised: true }, _count: { _all: true } }),
    prisma.maintenanceTicket.groupBy({
      by: ['propertyId'],
      where: { openToMarketplace: true, status: { not: 'RESOLVED' } },
      _count: { _all: true },
    }),
  ]);
  const propertyCountByState = new Map(propertyCounts.map((c) => [c.state, c._count._all]));
  // Job counts are per-property in real mode (no direct state column on the
  // ticket) — resolve through each property's state to build the same shape.
  const jobPropertyIds = jobCounts.map((c) => c.propertyId);
  const jobProperties = jobPropertyIds.length
    ? await prisma.property.findMany({ where: { id: { in: jobPropertyIds } }, select: { id: true, state: true } })
    : [];
  const stateByPropertyId = new Map(jobProperties.map((p) => [p.id, p.state]));
  const jobCountByState = new Map<string, number>();
  for (const c of jobCounts) {
    const state = stateByPropertyId.get(c.propertyId);
    if (state) jobCountByState.set(state, (jobCountByState.get(state) ?? 0) + c._count._all);
  }
  const states = NIGERIA_STATES.map((s) => ({
    name: s.name,
    slug: s.slug,
    propertyCount: propertyCountByState.get(s.name) ?? 0,
    jobCount: jobCountByState.get(s.name) ?? 0,
  }));
  res.json(states);
});

publicRouter.get('/public/properties', async (req, res) => {
  const state = stateBySlug(req.query.state as string | undefined);
  if (env.mockMode) {
    return res.json(MOCK_PROPERTIES.filter((p) => p.isAdvertised && (!state || p.state === state.name)));
  }
  const properties = await prisma.property.findMany({ where: { isAdvertised: true, ...(state ? { state: state.name } : {}) } });
  res.json(properties);
});

publicRouter.get('/public/properties/:id', async (req, res) => {
  if (env.mockMode) {
    const property = MOCK_PROPERTIES.find((p) => p.id === req.params.id && p.isAdvertised);
    return property ? res.json(property) : res.status(404).json({ error: 'Listing not found' });
  }
  const property = await prisma.property.findFirst({ where: { id: req.params.id, isAdvertised: true } });
  return property ? res.json(property) : res.status(404).json({ error: 'Listing not found' });
});

const viewingSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  scheduledFor: z.string(), // ISO datetime the visitor picked
  notes: z.string().optional(),
});

publicRouter.post('/public/properties/:id/book-viewing', async (req, res) => {
  const parsed = viewingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, phone, email, scheduledFor, notes } = parsed.data;

  let property;
  let booking;
  if (env.mockMode) {
    property = MOCK_PROPERTIES.find((p) => p.id === req.params.id);
    if (!property) return res.status(404).json({ error: 'Listing not found' });
    booking = createMockBooking({
      type: 'PROPERTY_VIEWING',
      propertyId: property.id,
      requesterName: name,
      requesterPhone: phone,
      requesterEmail: email,
      scheduledFor,
      notes,
    });
  } else {
    property = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!property) return res.status(404).json({ error: 'Listing not found' });
    booking = await prisma.booking.create({
      data: {
        type: 'PROPERTY_VIEWING',
        propertyId: property.id,
        requesterName: name,
        requesterPhone: phone,
        requesterEmail: email,
        scheduledFor: new Date(scheduledFor),
        notes,
      },
    });
  }

  await notifyOps(
    `New viewing request: ${property.title}`,
    `${name} (${phone}${email ? `, ${email}` : ''}) wants to view "${property.title}" on ${new Date(scheduledFor).toLocaleString('en-GB')}.${notes ? `\n\nNote: ${notes}` : ''}`,
  );
  void pushPropertyViewingBooking({
    propertyTitle: property.title,
    requesterName: name,
    requesterPhone: phone,
    requesterEmail: email,
    scheduledFor,
    notes,
  });

  res.status(201).json(booking);
});

// ---- Handyman marketplace -------------------------------------------------

function toPublicJob(t: any) {
  // Deliberately omits the exact street address and tenant identity —
  // handymen see enough to quote (LGA, state, category, description), full
  // address is shared only once a quote is accepted.
  return {
    id: t.id,
    propertyTitle: t.propertyTitle ?? t.property?.title,
    description: t.description,
    categoryLabel: t.categoryLabel,
    responsibility: t.responsibility,
    status: t.status,
    createdAt: t.createdAt,
  };
}

publicRouter.get('/public/repair-jobs', async (req, res) => {
  const state = stateBySlug(req.query.state as string | undefined);
  if (env.mockMode) {
    const jobs = mockTickets.filter((t) => t.openToMarketplace && t.status !== 'RESOLVED' && (!state || t.state === state.name));
    return res.json(jobs.map(toPublicJob));
  }
  const jobs = await prisma.maintenanceTicket.findMany({
    where: { openToMarketplace: true, status: { not: 'RESOLVED' }, ...(state ? { property: { state: state.name } } : {}) },
    include: { property: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(jobs.map(toPublicJob));
});

publicRouter.get('/public/repair-jobs/:id', async (req, res) => {
  if (env.mockMode) {
    const job = mockTickets.find((t) => t.id === req.params.id && t.openToMarketplace);
    return job ? res.json(toPublicJob(job)) : res.status(404).json({ error: 'Job not found' });
  }
  const job = await prisma.maintenanceTicket.findFirst({
    where: { id: req.params.id, openToMarketplace: true },
    include: { property: true },
  });
  return job ? res.json(toPublicJob(job)) : res.status(404).json({ error: 'Job not found' });
});

const quoteSchema = z.object({
  handymanName: z.string().min(2),
  handymanPhone: z.string().min(7),
  handymanEmail: z.string().email().optional(),
  amount: z.number().int().positive(),
  message: z.string().optional(),
});

// Path A: a handyman confident enough from the description/photos to price
// it directly.
publicRouter.post('/public/repair-jobs/:id/quote', async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  let job: any;
  let quote;
  if (env.mockMode) {
    job = mockTickets.find((t) => t.id === req.params.id && t.openToMarketplace);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    quote = createMockQuote({ maintenanceTicketId: job.id, ...parsed.data });
  } else {
    job = await prisma.maintenanceTicket.findFirst({
      where: { id: req.params.id, openToMarketplace: true },
      include: { property: true },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    quote = await prisma.repairQuote.create({ data: { maintenanceTicketId: job.id, ...parsed.data } });
  }
  const jobPropertyTitle = job.propertyTitle ?? job.property?.title;

  await notifyOps(
    `New repair quote: ${job.description}`,
    `${parsed.data.handymanName} (${parsed.data.handymanPhone}) quoted ₦${parsed.data.amount.toLocaleString()} for "${job.description}".${parsed.data.message ? `\n\nNote: ${parsed.data.message}` : ''}`,
  );
  void pushQuotation({
    jobDescription: job.description,
    propertyTitle: jobPropertyTitle,
    handymanName: parsed.data.handymanName,
    handymanPhone: parsed.data.handymanPhone,
    handymanEmail: parsed.data.handymanEmail,
    amount: parsed.data.amount,
    message: parsed.data.message,
  });

  res.status(201).json(quote);
});

const jobViewingSchema = z.object({
  handymanName: z.string().min(2),
  handymanPhone: z.string().min(7),
  handymanEmail: z.string().email().optional(),
  scheduledFor: z.string(),
  message: z.string().optional(),
});

// Path B: the job needs eyes-on before an accurate price is possible — book
// a site visit instead of guessing.
publicRouter.post('/public/repair-jobs/:id/book-viewing', async (req, res) => {
  const parsed = jobViewingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { handymanName, handymanPhone, handymanEmail, scheduledFor, message } = parsed.data;

  let job: any;
  let booking;
  if (env.mockMode) {
    job = mockTickets.find((t) => t.id === req.params.id && t.openToMarketplace);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    booking = createMockBooking({
      type: 'REPAIR_QUOTE_VISIT',
      maintenanceTicketId: job.id,
      requesterName: handymanName,
      requesterPhone: handymanPhone,
      requesterEmail: handymanEmail,
      scheduledFor,
      notes: message,
    });
  } else {
    job = await prisma.maintenanceTicket.findFirst({
      where: { id: req.params.id, openToMarketplace: true },
      include: { property: true },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    booking = await prisma.booking.create({
      data: {
        type: 'REPAIR_QUOTE_VISIT',
        maintenanceTicketId: job.id,
        requesterName: handymanName,
        requesterPhone: handymanPhone,
        requesterEmail: handymanEmail,
        scheduledFor: new Date(scheduledFor),
        notes: message,
      },
    });
  }

  const jobPropertyTitle = job.propertyTitle ?? job.property?.title;

  await notifyOps(
    `Site-visit request: ${job.description}`,
    `${handymanName} (${handymanPhone}) wants to view "${job.description}" (${jobPropertyTitle}) on ${new Date(scheduledFor).toLocaleString('en-GB')} before quoting.${message ? `\n\nNote: ${message}` : ''}`,
  );
  void pushHandymanVisitBooking({
    jobDescription: job.description,
    propertyTitle: jobPropertyTitle,
    handymanName,
    handymanPhone,
    handymanEmail,
    scheduledFor,
    message,
  });

  res.status(201).json(booking);
});

// ---- Legal team marketplace -------------------------------------------

function toPublicLegalRequest(r: (typeof mockLegalRequests)[number]) {
  // Same privacy pattern as repair jobs — enough for a lawyer to scope and
  // price the work, not enough to identify the tenant or exact address.
  return {
    id: r.id,
    propertyTitle: r.propertyTitle,
    category: r.category,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt,
  };
}

publicRouter.get('/public/legal-requests', async (_req, res) => {
  const requests = mockLegalRequests.filter((r) => r.openToMarketplace && r.status === 'OPEN');
  res.json(requests.map(toPublicLegalRequest));
});

publicRouter.get('/public/legal-requests/:id', async (req, res) => {
  const request = mockLegalRequests.find((r) => r.id === req.params.id && r.openToMarketplace);
  return request ? res.json(toPublicLegalRequest(request)) : res.status(404).json({ error: 'Request not found' });
});

const legalQuoteSchema = z.object({
  lawyerName: z.string().min(2),
  lawyerPhone: z.string().min(7),
  lawyerEmail: z.string().email().optional(),
  lawFirm: z.string().optional(),
  amount: z.number().int().positive(),
  message: z.string().optional(),
});

publicRouter.post('/public/legal-requests/:id/quote', async (req, res) => {
  const parsed = legalQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const request = mockLegalRequests.find((r) => r.id === req.params.id && r.openToMarketplace);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const quote = createMockLegalQuote({ legalRequestId: request.id, ...parsed.data });

  await notifyOps(
    `New legal proposal: ${request.category}`,
    `${parsed.data.lawyerName}${parsed.data.lawFirm ? ` (${parsed.data.lawFirm})` : ''} (${parsed.data.lawyerPhone}) proposed ₦${parsed.data.amount.toLocaleString()} for "${request.description}".${parsed.data.message ? `\n\nNote: ${parsed.data.message}` : ''}`,
  );

  res.status(201).json(quote);
});

// ---- Artisan directory (Phase 2) -------------------------------------
//
// The public, browse-anywhere face of the Artisan Network. Landlords and
// tenants find a verified tradesperson by trade + area, see the score, and
// either call directly or drop a quote request — without ever opening a
// marketplace job. Only listed, tier>=1 artisans appear.

interface DirectoryArtisan {
  id: string;
  name: string;
  businessName?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  phone: string;
  baseState: string;
  baseLga: string;
  coverageLgas: string[];
  skillLevel: 'HAND' | 'TRADESMAN' | 'MASTER';
  availability: 'OPEN' | 'BUSY' | 'AWAY';
  verificationTier: number;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  createdAt: string | Date;
  lastActiveAt: string | Date;
  trades: { trade: string; yearsExperience: number; isPrimary: boolean }[];
  workSamples: { id: string; imageUrl: string; caption?: string | null }[];
  credentials: { kind: string; status: string }[];
}

const SORTS = new Set(['score', 'rating', 'jobs', 'recent']);

async function loadListedArtisans(): Promise<DirectoryArtisan[]> {
  if (env.mockMode) {
    return [...mockArtisans.values()]
      .filter((a) => a.isListed && a.verificationTier >= 1)
      .map((a) => ({
        ...a,
        trades: a.trades.map((t) => ({ trade: t.trade, yearsExperience: t.yearsExperience, isPrimary: t.isPrimary })),
        workSamples: a.workSamples.map((w) => ({ id: w.id, imageUrl: w.imageUrl, caption: w.caption ?? null })),
        credentials: a.credentials.map((c) => ({ kind: c.kind, status: c.status })),
      }));
  }
  const rows = await prisma.artisan.findMany({
    where: { isListed: true, verificationTier: { gte: 1 } },
    include: {
      trades: { select: { trade: true, yearsExperience: true, isPrimary: true } },
      workSamples: { select: { id: true, imageUrl: true, caption: true }, orderBy: { createdAt: 'asc' } },
      credentials: { select: { kind: true, status: true } },
    },
  });
  return rows as unknown as DirectoryArtisan[];
}

const scoreOf = (a: DirectoryArtisan) =>
  computeArtisanScore({
    ratingAvg: a.ratingAvg,
    ratingCount: a.ratingCount,
    jobsCompleted: a.jobsCompleted,
    verificationTier: a.verificationTier,
    lastActiveAt: a.lastActiveAt,
  });

function toDirectoryCard(a: DirectoryArtisan) {
  const primary = a.trades.find((t) => t.isPrimary) ?? a.trades[0];
  const hero = a.workSamples[0]?.imageUrl ?? null;
  return {
    id: a.id,
    name: a.name,
    businessName: a.businessName ?? null,
    photoUrl: a.photoUrl ?? null,
    primaryTrade: primary ? { id: primary.trade, label: tradeLabel(primary.trade) } : null,
    tradeLabels: a.trades.map((t) => tradeLabel(t.trade)),
    baseState: a.baseState,
    baseLga: a.baseLga,
    coverageLgas: a.coverageLgas,
    skillLevel: a.skillLevel,
    availability: a.availability,
    verificationTier: a.verificationTier,
    ratingAvg: Math.round(a.ratingAvg * 10) / 10,
    ratingCount: a.ratingCount,
    jobsCompleted: a.jobsCompleted,
    score: scoreOf(a),
    heroPhoto: hero,
    photoCount: a.workSamples.length,
  };
}

publicRouter.get('/public/artisans/meta', (_req, res) => {
  res.json({ trades: TRADES });
});

publicRouter.get('/public/artisans', async (req, res) => {
  const tradeQ = typeof req.query.trade === 'string' && isTradeId(req.query.trade) ? (req.query.trade as TradeId) : undefined;
  const lgaQ = typeof req.query.lga === 'string' ? req.query.lga : undefined;
  const st = stateBySlug(req.query.state as string | undefined);
  const sort = typeof req.query.sort === 'string' && SORTS.has(req.query.sort) ? req.query.sort : 'score';

  let list = await loadListedArtisans();

  if (tradeQ) list = list.filter((a) => a.trades.some((t) => t.trade === tradeQ));
  if (lgaQ) list = list.filter((a) => a.baseLga === lgaQ || a.coverageLgas.includes(lgaQ));
  else if (st) {
    const inState = new Set(st.lgas);
    list = list.filter((a) => a.baseState === st.name || a.coverageLgas.some((l) => inState.has(l)));
  }

  const byId = new Map(list.map((a) => [a.id, a]));
  const cards = list.map(toDirectoryCard);
  cards.sort((a, b) => {
    if (sort === 'jobs') return b.jobsCompleted - a.jobsCompleted || b.score - a.score;
    if (sort === 'rating') {
      const ra = bayesianRating(a.ratingAvg, a.ratingCount);
      const rb = bayesianRating(b.ratingAvg, b.ratingCount);
      return rb - ra || b.score - a.score;
    }
    if (sort === 'recent') {
      const la = byId.get(a.id)!.lastActiveAt;
      const lb = byId.get(b.id)!.lastActiveAt;
      return new Date(lb).getTime() - new Date(la).getTime() || b.score - a.score;
    }
    return b.score - a.score || b.jobsCompleted - a.jobsCompleted;
  });

  res.json({ artisans: cards, total: cards.length });
});

publicRouter.get('/public/artisans/:id', async (req, res) => {
  const list = await loadListedArtisans();
  const a = list.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Artisan not found' });

  const tradeDefById = new Map(TRADES.map((t) => [t.id, t]));
  res.json({
    ...toDirectoryCard(a),
    bio: a.bio ?? null,
    phone: a.phone.startsWith('234') ? `+${a.phone}` : a.phone,
    memberSince: a.createdAt,
    trades: [...a.trades]
      .sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary))
      .map((t) => {
        const def = tradeDefById.get(t.trade as TradeId);
        return {
          id: t.trade,
          label: tradeLabel(t.trade),
          group: def?.group ?? null,
          blurb: def?.blurb ?? null,
          yearsExperience: t.yearsExperience,
          isPrimary: t.isPrimary,
        };
      }),
    workSamples: a.workSamples.map((w) => ({ id: w.id, imageUrl: w.imageUrl, caption: w.caption ?? null })),
    verifiedCredentials: a.credentials.filter((c) => c.status === 'VERIFIED').map((c) => c.kind),
  });
});

const leadSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().min(7).max(20),
  role: z.enum(['landlord', 'tenant', 'other']).optional(),
  lga: z.string().max(60).optional(),
  trade: z.string().optional(),
  message: z.string().min(3).max(800),
});

publicRouter.post('/public/artisans/:id/request-quote', async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const trade = d.trade && isTradeId(d.trade) ? (d.trade as TradeId) : undefined;

  const list = await loadListedArtisans();
  const a = list.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Artisan not found' });

  if (env.mockMode) {
    createMockLead({
      artisanId: a.id,
      requesterName: d.name,
      requesterPhone: d.phone,
      requesterRole: d.role,
      lga: d.lga,
      trade,
      message: d.message,
    });
  } else {
    await prisma.artisanLead.create({
      data: {
        artisanId: a.id,
        requesterName: d.name,
        requesterPhone: d.phone,
        requesterRole: d.role ?? null,
        lga: d.lga ?? null,
        trade: trade ?? null,
        message: d.message,
      },
    });
    await prisma.artisan.update({ where: { id: a.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
  }

  await notifyOps(
    `Artisan quote request — ${a.name}`,
    `${d.name} (${d.phone})${d.role ? `, a ${d.role},` : ''} wants a quote from ${a.name}` +
      `${a.businessName ? ` / ${a.businessName}` : ''} (${a.phone}).` +
      `${trade ? `\nTrade: ${tradeLabel(trade)}` : ''}${d.lga ? `\nArea: ${d.lga}` : ''}\n\n"${d.message}"`,
  );

  res.status(201).json({ ok: true, artisanName: a.name });
});
