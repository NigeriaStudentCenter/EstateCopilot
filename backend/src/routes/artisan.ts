// Artisan Network — Phase 1 API. Phone/OTP auth, profile & the five-axis
// classification, work-sample photos, tier 0/1 verification, and an
// artisan-attributed quote on a marketplace job.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { NIGERIA_STATES, stateByName } from '../lib/nigeriaStates.js';
import { TRADES, isTradeId, type TradeId } from '../lib/trades.js';
import { putPropertyImage, deletePropertyImage } from '../lib/blobStorage.js';
import { signArtisanToken, verifyArtisanToken, normalizePhone, issueOtp, checkOtp } from '../services/artisanAuth.js';
import { verifyNinBvn } from '../services/smileId.js';
import {
  mockArtisans,
  mockArtisansByPhone,
  createMockArtisan,
  type MockArtisan,
} from '../lib/mockArtisans.js';
import { mockTickets } from '../lib/mockMaintenance.js';
import { createMockQuote } from '../lib/mockBookings.js';

export const artisanRouter = Router();

const MAX_WORK_SAMPLES = 8;
const MAX_IMAGE_BYTES = env.storage.maxImageBytes;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_WORK_SAMPLES } });

const ALL_LGAS = new Set(NIGERIA_STATES.flatMap((s) => s.lgas));

// ---- public metadata (drives the setup wizard) -------------------------
artisanRouter.get('/artisan-meta/trades', (_req, res) => {
  res.json(TRADES);
});
artisanRouter.get('/artisan-meta/states', (_req, res) => {
  res.json(NIGERIA_STATES.map((s) => ({ name: s.name, slug: s.slug, lgas: s.lgas })));
});

// ---- auth --------------------------------------------------------------
artisanRouter.post('/artisan-auth/otp/request', (req, res) => {
  const parsed = z.object({ phone: z.string().min(7) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid phone number' });
  const phone = normalizePhone(parsed.data.phone);
  const { devOtp } = issueOtp(phone);
  res.json({ sent: true, ...(devOtp ? { devOtp } : {}) });
});

const verifySchema = z.object({
  phone: z.string().min(7),
  code: z.string().length(6),
  name: z.string().min(2).max(80).optional(),
  state: z.string().optional(), // Nigeria state name — required only for a new account
  lga: z.string().optional(),
});

artisanRouter.post('/artisan-auth/otp/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const phone = normalizePhone(parsed.data.phone);
  if (!checkOtp(phone, parsed.data.code)) return res.status(401).json({ error: 'Invalid or expired code' });

  // existing account?
  const existing = env.mockMode
    ? (mockArtisansByPhone.get(phone) ? mockArtisans.get(mockArtisansByPhone.get(phone)!)! : null)
    : await prisma.artisan.findUnique({ where: { phone } });
  if (existing) {
    touchLastActive(existing.id).catch(() => {});
    return res.json({ token: signArtisanToken({ artisanId: existing.id, phone }), isNew: false });
  }

  // new account — need a name + a base location
  const name = parsed.data.name?.trim();
  const st = stateByName(parsed.data.state);
  const lga = parsed.data.lga && ALL_LGAS.has(parsed.data.lga) ? parsed.data.lga : st?.lgas[0];
  if (!name || !st || !lga) {
    return res.status(422).json({ error: 'New account needs your name, state and LGA', needsProfile: true });
  }

  const created = env.mockMode
    ? createMockArtisan({ phone, name, baseState: st.name, baseLga: lga })
    : await prisma.artisan.create({ data: { phone, name, baseState: st.name, baseLga: lga } });
  res.status(201).json({ token: signArtisanToken({ artisanId: created.id, phone }), isNew: true });
});

export interface ArtisanAuthedRequest extends Request {
  artisan?: { artisanId: string; phone: string };
}
export function requireArtisanAuth(req: ArtisanAuthedRequest, res: Response, next: NextFunction) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  try {
    req.artisan = verifyArtisanToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

async function touchLastActive(id: string) {
  if (env.mockMode) {
    const a = mockArtisans.get(id);
    if (a) a.lastActiveAt = new Date().toISOString();
    return;
  }
  await prisma.artisan.update({ where: { id }, data: { lastActiveAt: new Date() } });
}

async function loadArtisan(id: string) {
  if (env.mockMode) return mockArtisans.get(id) ?? null;
  return prisma.artisan.findUnique({
    where: { id },
    include: { trades: true, credentials: true, workSamples: true },
  });
}

const publicShape = (a: MockArtisan | NonNullable<Awaited<ReturnType<typeof loadArtisan>>>) => a;

// ---- profile ---------------------------------------------------------
artisanRouter.get('/artisan/me', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const a = await loadArtisan(req.artisan!.artisanId);
  if (!a) return res.status(404).json({ error: 'Account not found' });
  res.json(publicShape(a));
});

const profileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  businessName: z.string().max(120).nullable().optional(),
  bio: z.string().max(600).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  baseState: z.string().optional(),
  baseLga: z.string().optional(),
  coverageLgas: z.array(z.string()).max(20).optional(),
  availability: z.enum(['OPEN', 'BUSY', 'AWAY']).optional(),
  skillLevel: z.enum(['HAND', 'TRADESMAN']).optional(), // MASTER is Ops-granted only
});

artisanRouter.patch('/artisan/me', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const p = parsed.data;

  if (p.baseState && !stateByName(p.baseState)) return res.status(400).json({ error: 'Unknown state' });
  for (const lga of [...(p.coverageLgas ?? []), ...(p.baseLga ? [p.baseLga] : [])]) {
    if (!ALL_LGAS.has(lga)) return res.status(400).json({ error: `Unknown LGA: ${lga}` });
  }
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));

  if (env.mockMode) {
    const a = mockArtisans.get(req.artisan!.artisanId);
    if (!a) return res.status(404).json({ error: 'Account not found' });
    Object.assign(a, clean);
    return res.json(a);
  }
  const updated = await prisma.artisan.update({
    where: { id: req.artisan!.artisanId },
    data: clean,
    include: { trades: true, credentials: true, workSamples: true },
  });
  res.json(updated);
});

// ---- trades (replace the whole set) --------------------------------
const tradesSchema = z.object({
  trades: z
    .array(
      z.object({
        trade: z.string().refine(isTradeId, 'unknown trade'),
        yearsExperience: z.number().int().min(0).max(60).default(0),
        isPrimary: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(6),
});

artisanRouter.put('/artisan/me/trades', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = tradesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  let rows = parsed.data.trades as { trade: TradeId; yearsExperience: number; isPrimary: boolean }[];
  // exactly one primary
  if (!rows.some((r) => r.isPrimary)) rows[0].isPrimary = true;
  rows = rows.map((r, i) => ({ ...r, isPrimary: r.isPrimary && rows.findIndex((x) => x.isPrimary) === i }));

  const id = req.artisan!.artisanId;
  if (env.mockMode) {
    const a = mockArtisans.get(id);
    if (!a) return res.status(404).json({ error: 'Account not found' });
    a.trades = rows.map((r, i) => ({ id: `mt_${Date.now()}_${i}`, ...r }));
    return res.json(a.trades);
  }
  await prisma.artisanTrade.deleteMany({ where: { artisanId: id } });
  await prisma.artisanTrade.createMany({ data: rows.map((r) => ({ artisanId: id, ...r })) });
  res.json(await prisma.artisanTrade.findMany({ where: { artisanId: id } }));
});

// ---- work samples --------------------------------------------------
artisanRouter.post(
  '/artisan/me/work-samples',
  requireArtisanAuth,
  (req: ArtisanAuthedRequest, res: Response, next) => {
    upload.array('images', MAX_WORK_SAMPLES)(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? `Each photo must be under ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB`
            : `Upload rejected: ${err.message}`;
        return res.status(400).json({ error: msg });
      }
      if (err) return next(err);
      next();
    });
  },
  async (req: ArtisanAuthedRequest, res: Response) => {
    const a = await loadArtisan(req.artisan!.artisanId);
    if (!a) return res.status(404).json({ error: 'Account not found' });
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'No image files received (field "images")' });
    if (files.some((f) => !ALLOWED_MIME.has(f.mimetype)))
      return res.status(400).json({ error: 'Only JPEG, PNG, WebP, HEIC or AVIF images are allowed' });

    const existing = a.workSamples ?? [];
    const room = MAX_WORK_SAMPLES - existing.length;
    if (room <= 0) return res.status(400).json({ error: `Maximum ${MAX_WORK_SAMPLES} work photos — remove one first.` });
    if (files.length > room) return res.status(400).json({ error: `Only room for ${room} more photo(s).` });

    try {
      const stored = await Promise.all(
        files.map(async (f) => {
          const jpeg = await sharp(f.buffer)
            .rotate()
            .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
          return putPropertyImage(jpeg);
        }),
      );
      if (env.mockMode) {
        const m = mockArtisans.get(a.id)!;
        stored.forEach((s, i) =>
          m.workSamples.push({ id: `ws_${Date.now()}_${i}`, imageUrl: s.url, createdAt: new Date().toISOString() }),
        );
        return res.status(201).json(m.workSamples);
      }
      await prisma.workSample.createMany({ data: stored.map((s) => ({ artisanId: a.id, imageUrl: s.url })) });
      res.status(201).json(await prisma.workSample.findMany({ where: { artisanId: a.id } }));
    } catch (err) {
      console.error('[artisan] work-sample processing failed:', err);
      res.status(422).json({ error: 'Could not process one of those photos — try another.' });
    }
  },
);

artisanRouter.delete('/artisan/me/work-samples', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = z.object({ url: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide the photo url to remove' });
  const a = await loadArtisan(req.artisan!.artisanId);
  if (!a) return res.status(404).json({ error: 'Account not found' });

  if (env.mockMode) {
    const m = mockArtisans.get(a.id)!;
    const before = m.workSamples.length;
    m.workSamples = m.workSamples.filter((w) => w.imageUrl !== parsed.data.url);
    if (m.workSamples.length === before) return res.status(404).json({ error: 'Not on this profile' });
    await deletePropertyImage(parsed.data.url);
    return res.json(m.workSamples);
  }
  const row = await prisma.workSample.findFirst({ where: { artisanId: a.id, imageUrl: parsed.data.url } });
  if (!row) return res.status(404).json({ error: 'Not on this profile' });
  await prisma.workSample.delete({ where: { id: row.id } });
  await deletePropertyImage(parsed.data.url);
  res.json(await prisma.workSample.findMany({ where: { artisanId: a.id } }));
});

// ---- verification (tier 1: NIN / BVN) -----------------------------
artisanRouter.post('/artisan/me/verify', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = z
    .object({ kind: z.enum(['NIN', 'BVN']), idNumber: z.string().min(8).max(20) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your NIN or BVN' });
  const a = await loadArtisan(req.artisan!.artisanId);
  if (!a) return res.status(404).json({ error: 'Account not found' });

  const check = await verifyNinBvn({
    [parsed.data.kind === 'NIN' ? 'nin' : 'bvn']: parsed.data.idNumber,
    fullName: a.name,
  });
  const status = check.status === 'VERIFIED' ? 'VERIFIED' : 'FAILED';
  const now = new Date();

  if (env.mockMode) {
    const m = mockArtisans.get(a.id)!;
    m.credentials.push({
      id: `cr_${Date.now()}`,
      kind: parsed.data.kind,
      status,
      resolvedName: check.matchedName,
      verifiedAt: status === 'VERIFIED' ? now.toISOString() : undefined,
      createdAt: now.toISOString(),
    });
    if (status === 'VERIFIED' && m.verificationTier < 1) {
      m.verificationTier = 1;
      m.isListed = true;
    }
    return res.json({ status, verificationTier: m.verificationTier, isListed: m.isListed, resolvedName: check.matchedName });
  }

  await prisma.artisanCredential.create({
    data: {
      artisanId: a.id,
      kind: parsed.data.kind,
      status,
      resolvedName: check.matchedName,
      verifiedAt: status === 'VERIFIED' ? now : null,
    },
  });
  let tier = a.verificationTier;
  let listed = a.isListed;
  if (status === 'VERIFIED' && tier < 1) {
    tier = 1;
    listed = true;
    await prisma.artisan.update({ where: { id: a.id }, data: { verificationTier: 1, isListed: true } });
  }
  res.json({ status, verificationTier: tier, isListed: listed, resolvedName: check.matchedName });
});

// ---- jobs (Phase 1: browse open marketplace work in coverage area) ----
artisanRouter.get('/artisan/jobs', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const a = await loadArtisan(req.artisan!.artisanId);
  if (!a) return res.status(404).json({ error: 'Account not found' });
  const lgas = new Set<string>([a.baseLga, ...a.coverageLgas]);

  if (env.mockMode) {
    const jobs = mockTickets
      .filter((t) => t.openToMarketplace && t.status !== 'RESOLVED' && (lgas.size === 0 || lgas.has((t as { lga?: string }).lga ?? '')))
      .map((t) => publicJob(t));
    return res.json(jobs);
  }
  const rows = await prisma.maintenanceTicket.findMany({
    where: {
      openToMarketplace: true,
      status: { not: 'RESOLVED' },
      property: { lga: { in: [...lgas] } },
    },
    include: { property: { select: { lga: true, state: true, title: true } }, quotes: { select: { artisanId: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    rows.map((t) => ({
      id: t.id,
      description: t.description,
      categoryLabel: t.categoryLabel,
      responsibility: t.responsibility,
      lga: t.property.lga,
      state: t.property.state,
      createdAt: t.createdAt,
      alreadyQuoted: t.quotes.some((q) => q.artisanId === a.id),
    })),
  );
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publicJob(t: any) {
  return {
    id: t.id,
    description: t.description,
    categoryLabel: t.categoryLabel ?? null,
    responsibility: t.responsibility ?? 'UNCLEAR',
    lga: t.lga ?? null,
    state: t.state ?? null,
    createdAt: t.createdAt,
    alreadyQuoted: Array.isArray(t.quotes) && t.quotes.some((q: { artisanId?: string }) => !!q.artisanId),
  };
}

// ---- quote a job (RepairQuote carries artisanId) --------------------
const quoteSchema = z.object({ amount: z.number().int().positive().max(50_000_000), message: z.string().max(500).optional() });

artisanRouter.post('/artisan/jobs/:ticketId/quote', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid amount' });
  const a = await loadArtisan(req.artisan!.artisanId);
  if (!a) return res.status(404).json({ error: 'Account not found' });

  if (env.mockMode) {
    const job = mockTickets.find((t) => t.id === req.params.ticketId && t.openToMarketplace);
    if (!job) return res.status(404).json({ error: 'That job is not open for quotes' });
    const quote = createMockQuote({
      maintenanceTicketId: job.id,
      handymanName: a.name,
      handymanPhone: a.phone,
      amount: parsed.data.amount,
      message: parsed.data.message,
    });
    (quote as { artisanId?: string }).artisanId = a.id;
    return res.status(201).json(quote);
  }

  const job = await prisma.maintenanceTicket.findFirst({
    where: { id: req.params.ticketId, openToMarketplace: true, status: { not: 'RESOLVED' } },
  });
  if (!job) return res.status(404).json({ error: 'That job is not open for quotes' });
  const quote = await prisma.repairQuote.create({
    data: {
      maintenanceTicketId: job.id,
      artisanId: a.id,
      handymanName: a.name,
      handymanPhone: a.phone,
      amount: parsed.data.amount,
      message: parsed.data.message ?? null,
    },
  });
  await touchLastActive(a.id);
  res.status(201).json(quote);
});
