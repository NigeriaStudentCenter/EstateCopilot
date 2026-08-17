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
