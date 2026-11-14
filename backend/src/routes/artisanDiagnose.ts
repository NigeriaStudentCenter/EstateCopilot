import { Router, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { requireArtisanAuth, type ArtisanAuthedRequest } from './artisan.js';
import { mockArtisans } from '../lib/mockArtisans.js';
import { putPrivateDoc } from '../lib/blobStorage.js';
import { runPlumbingDiagnosis, DiagnosisUnavailable, type Diagnosis } from '../lib/plumbingDiagnosis.js';
import { TRADE_IDS, tradeConfig, tradeAccess, parseTrade, isDiagnosisTrade, type TradeRollout } from '../lib/diagnosisTrades/index.js';
import { supplyConfigured, getCatalogue, rateSupplyRequest, createSupplyRequest, getSupplyRequest, acceptSupplyQuote, cancelSupplyRequest, confirmSupplyOrder, disputeSupplyOrder, externalRefFor, SupplyError, type SupplyRequestView } from '../lib/supplyClient.js';

export const artisanDiagnoseRouter = Router();

const MAX_PHOTOS = 3;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.storage.maxImageBytes, files: MAX_PHOTOS } });

interface StoredDiagnosis {
  id: string;
  artisanId: string;
  note: string | null;
  photoKeys: string[];
  outcome: string;
  confidence: string;
  result: Diagnosis;
  model: string;
  partsRequestedAt: Date | null;
  supplyRequestId?: string | null;
  trade?: string;
  createdAt: Date;
}
const mockStore: StoredDiagnosis[] = [];
// A materials list sent for supplier prices is stored as a diagnosis row with no photos, so quotes, accepting, orders and
// ratings all reuse the diagnosis flow. It does not count toward the daily photo-diagnosis limit.
const MATERIALS_MODEL = 'materials-list';

const full = (d: StoredDiagnosis) => ({ id: d.id, trade: d.trade ?? 'PLUMBING', createdAt: d.createdAt.toISOString(), note: d.note, photoCount: d.photoKeys.length, partsRequestedAt: d.partsRequestedAt?.toISOString() ?? null, supplyRequestId: d.supplyRequestId ?? null, materials: d.model === MATERIALS_MODEL, ...d.result });
const card = (d: StoredDiagnosis) => ({
  id: d.id,
  trade: d.trade ?? 'PLUMBING',
  createdAt: d.createdAt.toISOString(),
  summary: d.result.summary,
  outcome: d.outcome,
  confidence: d.confidence,
  urgency: d.result.urgency,
  safetyLevel: d.result.safety.level,
  partsRequestedAt: d.partsRequestedAt?.toISOString() ?? null,
});

async function recentCount(artisanId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  if (env.mockMode) return mockStore.filter((d) => d.artisanId === artisanId && d.createdAt >= since && d.model !== MATERIALS_MODEL).length;
  return prisma.artisanDiagnosis.count({ where: { artisanId, createdAt: { gte: since }, model: { not: MATERIALS_MODEL } } });
}

async function loadMine(artisanId: string, id: string): Promise<StoredDiagnosis | null> {
  if (env.mockMode) return mockStore.find((d) => d.id === id && d.artisanId === artisanId) ?? null;
  const r = await prisma.artisanDiagnosis.findFirst({ where: { id, artisanId } });
  return r ? ({ ...r, result: r.result as unknown as Diagnosis } as StoredDiagnosis) : null;
}

async function who(artisanId: string) {
  if (env.mockMode) return mockArtisans.get(artisanId) ?? null;
  return prisma.artisan.findUnique({ where: { id: artisanId }, include: { trades: true } });
}

const rollout = (): TradeRollout => ({ live: env.diagnose.tradesLive, beta: env.diagnose.tradesBeta, betaPhones: env.diagnose.betaPhones });

// Which trades this artisan sees in the app, and whether each can be used right now (and why not). The same rules are
// enforced again on the diagnose call itself.
artisanDiagnoseRouter.get('/artisan/me/diagnose-trades', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const a = await who(req.artisan!.artisanId);
  if (!a) return res.status(404).json({ error: 'Account not found' });
  const ro = rollout();
  const out = TRADE_IDS.flatMap((id) => {
    const cfg = tradeConfig(id);
    const acc = tradeAccess(cfg, a as { phone: string; verificationTier: number; trades?: { trade: string }[] }, ro);
    // A trade that is not open to this artisan at all (not live, or beta and not on the list) is simply not shown.
    if (!acc.ok && (acc.code === 'NOT_AVAILABLE' || acc.code === 'BETA_ONLY')) return [];
    return [{ id, label: cfg.label, icon: cfg.icon, intro: cfg.intro, notice: cfg.notice ?? null, beta: acc.ok ? acc.beta : ro.beta.includes(id), available: acc.ok, reason: acc.ok ? null : acc.error }];
  });
  res.json({ trades: out });
});

// ---- diagnose (trades come from the registry in lib/diagnosisTrades; access follows the rollout env) ----------
artisanDiagnoseRouter.post(
  '/artisan/me/diagnose',
  requireArtisanAuth,
  (req: ArtisanAuthedRequest, res: Response, next) => {
    upload.array('images', MAX_PHOTOS)(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? `Each photo must be under ${Math.round(env.storage.maxImageBytes / (1024 * 1024))} MB` : `Upload rejected: ${err.message}`;
        return res.status(400).json({ error: msg });
      }
      if (err) return next(err);
      next();
    });
  },
  async (req: ArtisanAuthedRequest, res: Response) => {
    const artisanId = req.artisan!.artisanId;
    const a = await who(artisanId);
    if (!a) return res.status(404).json({ error: 'Account not found' });

    const trade = parseTrade(req.body?.trade);
    if (!trade) return res.status(400).json({ error: 'Unknown trade.' });
    const acc = tradeAccess(tradeConfig(trade), a as { phone: string; verificationTier: number; trades?: { trade: string }[] }, rollout());
    if (!acc.ok) return res.status(403).json({ error: acc.error });
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'Add at least one photo (field "images").' });
    if (files.some((f) => !ALLOWED_MIME.has(f.mimetype))) return res.status(400).json({ error: 'Only JPEG, PNG, WebP, HEIC or AVIF photos are allowed.' });
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';

    if ((await recentCount(artisanId)) >= env.diagnose.dailyLimit) {
      return res.status(429).json({ error: `You have used today's ${env.diagnose.dailyLimit} photo diagnoses. Try again tomorrow.` });
    }

    let jpegs: Buffer[];
    try {
      // Re-encoding also strips EXIF (GPS location) from the photos.
      jpegs = await Promise.all(files.map((f) => sharp(f.buffer).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer()));
    } catch {
      return res.status(400).json({ error: "We couldn't read one of the photos. Try taking it again." });
    }

    let result: Awaited<ReturnType<typeof runPlumbingDiagnosis>>;
    try {
      result = await runPlumbingDiagnosis({
        images: jpegs.map((b) => ({ base64: b.toString('base64'), mediaType: 'image/jpeg' as const })),
        note,
        location: `${a.baseLga}, ${a.baseState}`,
        trade,
      }, fetch, await getCatalogue(trade));
    } catch (e) {
      if (!(e instanceof DiagnosisUnavailable)) console.error('[diagnose] unexpected', e);
      return res.status(503).json({ error: "The diagnosis service couldn't read this right now. Please try again in a moment." });
    }

    const photoKeys = await Promise.all(jpegs.map((b) => putPrivateDoc(b, 'jpg', 'image/jpeg')));
    const base = { artisanId, trade, note: note || null, photoKeys, outcome: result.diagnosis.outcome, confidence: result.diagnosis.confidence, model: result.model };
    let stored: StoredDiagnosis;
    if (env.mockMode) {
      stored = { id: `dg_${Date.now()}`, ...base, result: result.diagnosis, partsRequestedAt: null, createdAt: new Date() };
      mockStore.unshift(stored);
    } else {
      const row = await prisma.artisanDiagnosis.create({ data: { ...base, result: result.diagnosis as unknown as Prisma.InputJsonValue } });
      stored = { ...row, result: result.diagnosis } as StoredDiagnosis;
    }
    res.status(201).json(full(stored));
  },
);

artisanDiagnoseRouter.get('/artisan/me/diagnoses', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const id = req.artisan!.artisanId;
  if (env.mockMode) return res.json(mockStore.filter((d) => d.artisanId === id).slice(0, 30).map(card));
  const rows = await prisma.artisanDiagnosis.findMany({ where: { artisanId: id }, orderBy: { createdAt: 'desc' }, take: 30 });
  res.json(rows.map((r) => card({ ...r, result: r.result as unknown as Diagnosis } as StoredDiagnosis)));
});

artisanDiagnoseRouter.get('/artisan/me/diagnoses/:id', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const d = await loadMine(req.artisan!.artisanId, req.params.id);
  if (!d) return res.status(404).json({ error: 'Diagnosis not found' });
  res.json(full(d));
});

// ---- send the parts list to the trade desk on WhatsApp ----------------------
const partsSchema = z.object({
  parts: z.array(z.object({ name: z.string().min(1).max(100), spec: z.string().max(120).optional(), qty: z.number().int().min(1).max(5000), unit: z.string().max(20).optional(), catalogueId: z.string().max(60).optional() })).min(1).max(15).optional(),
});

artisanDiagnoseRouter.post('/artisan/me/diagnoses/:id/parts-request', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = partsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Check the parts list and try again.' });
  const artisanId = req.artisan!.artisanId;
  const d = await loadMine(artisanId, req.params.id);
  if (!d) return res.status(404).json({ error: 'Diagnosis not found' });
  const parts = parsed.data.parts ?? d.result.parts;
  if (parts.length === 0) return res.status(400).json({ error: 'There are no parts to request for this diagnosis.' });
  const a = await who(artisanId);
  if (!a) return res.status(404).json({ error: 'Account not found' });

  const lines = parts.map((p, i) => `${i + 1}. ${p.name}${p.spec ? ` (${p.spec})` : ''} x ${p.qty}${p.unit ? ` ${p.unit}` : ''}`);
  const message =
    `*Parts request - EstateCopilot*\n` +
    `From: ${a.name} (${a.phone})\nLocation: ${a.baseLga}, ${a.baseState}\nJob: ${d.result.summary}\n\nParts needed:\n${lines.join('\n')}\n\n` +
    `Please reply with price, what is in stock and how fast you can deliver. Thank you.`;
  const to = env.diagnose.tradeDeskWhatsapp;

  const now = new Date();
  // Ask nearby suppliers for quotes through Kolo. If that is unavailable the artisan still has the WhatsApp trade desk.
  let supply: { requestId: string; suppliersAlerted: number; escalated: boolean } | null = null;
  let supplyRequestId = d.supplyRequestId ?? null;
  if (supplyConfigured()) {
    try {
      const ref = externalRefFor(d.id, parts);
      const created = await createSupplyRequest({ trade: (d.trade && isDiagnosisTrade(d.trade) ? d.trade : 'PLUMBING'), externalRef: ref, requesterName: a.name, requesterPhone: a.phone, state: a.baseState, lga: a.baseLga, jobSummary: d.result.summary, items: parts.map((p) => ({ name: p.name, spec: p.spec, qty: p.qty, unit: p.unit, catalogueId: p.catalogueId })) });
      // The list changed since last time: close the old open request so suppliers stop pricing it.
      if (supplyRequestId && supplyRequestId !== created.id) await cancelSupplyRequest(supplyRequestId).catch(() => undefined);
      supplyRequestId = created.id;
      supply = { requestId: created.id, suppliersAlerted: created.suppliersAlerted, escalated: created.escalated };
    } catch (e) {
      console.warn('[supply] could not create request', e instanceof Error ? e.message : e);
    }
  }
  if (env.mockMode) d.partsRequestedAt = now;
  else await prisma.artisanDiagnosis.update({ where: { id: d.id }, data: { partsRequestedAt: now, supplyRequestId } });
  res.json({ message, whatsappUrl: `https://wa.me/${to}?text=${encodeURIComponent(message)}`, tradeDesk: to, parts, supply });
});

// ---- a materials list (from the building estimator) sent for supplier prices ----------------------------------
const materialsSchema = z.object({
  trade: z.literal('BUILDING'),
  title: z.string().trim().max(80).optional(),
  items: z.array(z.object({ name: z.string().min(1).max(100), spec: z.string().max(120).optional(), qty: z.number().int().min(1).max(5000), unit: z.string().max(20).optional(), catalogueId: z.string().max(60).optional() })).min(1).max(15),
});
const BUILDING_TRADES = ['BRICKLAYER', 'TILER', 'ROOFER'];

artisanDiagnoseRouter.post('/artisan/me/materials-request', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = materialsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Check the materials list. Suppliers take up to 15 items per request.' });
  const artisanId = req.artisan!.artisanId;
  const a = await who(artisanId);
  if (!a) return res.status(404).json({ error: 'Account not found' });
  if (!((a as { trades?: { trade: string }[] }).trades ?? []).some((t) => BUILDING_TRADES.includes(t.trade))) return res.status(403).json({ error: 'Add Bricklayer / Mason, Tiler / Marble or Roofer to your trades on the Profile tab to request building materials.' });
  const { items, title } = parsed.data;
  const summary = `Materials list${title ? `: ${title}` : ''}`.slice(0, 120);
  const result: Diagnosis = { outcome: 'DIAGNOSED', summary, confidence: 'HIGH', fixture: 'Materials list', defect: 'Not applicable', alternativeCauses: [], urgency: 'ROUTINE', safety: { level: 'NORMAL', warnings: [], escalate: false }, tools: [], parts: items, steps: [], checks: [], photoRequests: [] } as Diagnosis;
  const now = new Date();
  const base = { artisanId, trade: 'BUILDING', note: null, photoKeys: [] as string[], outcome: 'DIAGNOSED', confidence: 'HIGH', model: MATERIALS_MODEL };
  let stored: StoredDiagnosis;
  if (env.mockMode) { stored = { id: `dg_${Date.now()}`, ...base, result, partsRequestedAt: now, createdAt: now }; mockStore.unshift(stored); }
  else { const row = await prisma.artisanDiagnosis.create({ data: { ...base, result: result as unknown as Prisma.InputJsonValue, partsRequestedAt: now } }); stored = { ...row, result } as StoredDiagnosis; }

  const lines = items.map((p, i) => `${i + 1}. ${p.name}${p.spec ? ` (${p.spec})` : ''} x ${p.qty}${p.unit ? ` ${p.unit}` : ''}`);
  const message = `*Materials request - EstateCopilot*\nFrom: ${a.name} (${a.phone})\nLocation: ${a.baseLga}, ${a.baseState}\nJob: ${summary}\n\nMaterials needed:\n${lines.join('\n')}\n\nPlease reply with price, what is in stock and how fast you can deliver. Thank you.`;
  let supply: { requestId: string; suppliersAlerted: number; escalated: boolean } | null = null;
  if (supplyConfigured()) {
    try {
      const created = await createSupplyRequest({ trade: 'BUILDING', externalRef: externalRefFor(stored.id, items), requesterName: a.name, requesterPhone: a.phone, state: a.baseState, lga: a.baseLga, jobSummary: summary, items });
      supply = { requestId: created.id, suppliersAlerted: created.suppliersAlerted, escalated: created.escalated };
      if (env.mockMode) stored.supplyRequestId = created.id;
      else await prisma.artisanDiagnosis.update({ where: { id: stored.id }, data: { supplyRequestId: created.id } });
    } catch (e) {
      console.warn('[supply] could not create materials request', e instanceof Error ? e.message : e);
    }
  }
  const to = env.diagnose.tradeDeskWhatsapp;
  res.status(201).json({ id: stored.id, message, whatsappUrl: `https://wa.me/${to}?text=${encodeURIComponent(message)}`, tradeDesk: to, supply });
});

// What the artisan app needs to show quotes, the order, and (once the parts have arrived) the rating box.
const supplyPayload = (r: SupplyRequestView) => ({
  requestId: r.id, status: r.status, expiresAt: r.expiresAt, escalated: r.escalated, suppliersAlerted: r.suppliersAlerted, acceptedQuoteId: r.acceptedQuoteId, items: r.items, quotes: r.quotes,
  paymentsEnabled: r.paymentsEnabled, order: r.order, rating: r.rating ?? null, canRate: r.canRate ?? false,
});

// ---- supplier quotes for a diagnosis' parts list (from Kolo) --------------------
artisanDiagnoseRouter.get('/artisan/me/diagnoses/:id/quotes', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const d = await loadMine(req.artisan!.artisanId, req.params.id);
  if (!d) return res.status(404).json({ error: 'Diagnosis not found' });
  if (!d.supplyRequestId) return res.json({ supply: null });
  try {
    const r = await getSupplyRequest(d.supplyRequestId);
    res.json({ supply: supplyPayload(r) });
  } catch (e) {
    res.status(503).json({ error: 'Supplier quotes are not available right now. You can still ask the trade desk on WhatsApp.' });
    console.warn('[supply] quotes fetch failed', e instanceof Error ? e.message : e);
  }
});

artisanDiagnoseRouter.post('/artisan/me/diagnoses/:id/quotes/:quoteId/accept', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const d = await loadMine(req.artisan!.artisanId, req.params.id);
  if (!d || !d.supplyRequestId) return res.status(404).json({ error: 'Diagnosis not found' });
  try {
    const r = await acceptSupplyQuote(d.supplyRequestId, req.params.quoteId, `${env.artisanPortal.url}/?tab=diagnose&dx=${encodeURIComponent(d.id)}`);
    res.json({ supply: supplyPayload(r) });
  } catch (e) {
    if (e instanceof SupplyError && e.status === 409) return res.status(409).json({ error: 'That quote is no longer available. Pick another.' });
    res.status(503).json({ error: "We couldn't confirm your choice. Please try again." });
  }
});

// ---- the paid order for a diagnosis' chosen quote: confirm receipt or report a problem ------
async function liveOrderFor(artisanId: string, diagnosisId: string): Promise<{ orderId: string } | null> {
  const d = await loadMine(artisanId, diagnosisId);
  if (!d?.supplyRequestId) return null;
  const r: SupplyRequestView = await getSupplyRequest(d.supplyRequestId);
  return r.order ? { orderId: r.order.id } : null;
}
artisanDiagnoseRouter.post('/artisan/me/diagnoses/:id/order/confirm', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  try {
    const o = await liveOrderFor(req.artisan!.artisanId, req.params.id);
    if (!o) return res.status(404).json({ error: 'No order found' });
    res.json({ order: await confirmSupplyOrder(o.orderId) });
  } catch (e) {
    if (e instanceof SupplyError && e.status === 409) return res.status(409).json({ error: 'This order cannot be confirmed right now.' });
    res.status(503).json({ error: "We couldn't confirm that. Please try again." });
  }
});
artisanDiagnoseRouter.post('/artisan/me/diagnoses/:id/order/dispute', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = z.object({ note: z.string().min(3).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Tell us briefly what went wrong.' });
  try {
    const o = await liveOrderFor(req.artisan!.artisanId, req.params.id);
    if (!o) return res.status(404).json({ error: 'No order found' });
    res.json({ order: await disputeSupplyOrder(o.orderId, parsed.data.note) });
  } catch (e) {
    if (e instanceof SupplyError && e.status === 409) return res.status(409).json({ error: 'A problem cannot be reported on this order now.' });
    res.status(503).json({ error: "We couldn't send that. Please try again." });
  }
});

// ---- rate the supplier once the parts have arrived (one rating per request; Kolo decides when it is allowed) ------
const ratingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  onTime: z.boolean().optional(),
  asDescribed: z.boolean().optional(),
  comment: z.string().trim().max(300).optional(),
});
artisanDiagnoseRouter.post('/artisan/me/diagnoses/:id/rating', requireArtisanAuth, async (req: ArtisanAuthedRequest, res) => {
  const parsed = ratingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Choose 1 to 5 stars.' });
  const d = await loadMine(req.artisan!.artisanId, req.params.id);
  if (!d?.supplyRequestId) return res.status(404).json({ error: 'Diagnosis not found' });
  try {
    res.status(201).json({ supply: supplyPayload(await rateSupplyRequest(d.supplyRequestId, parsed.data)) });
  } catch (e) {
    if (e instanceof SupplyError && e.status === 409) return res.status(409).json({ error: e.message });
    res.status(503).json({ error: "We couldn't save your rating. Please try again." });
  }
});
