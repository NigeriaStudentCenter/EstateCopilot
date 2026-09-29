import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { demoLandlordIds } from '../lib/demo.js';
import { resetAllDemoLandlords, takeDemoSnapshot } from '../services/demoReset.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { depositSplit, settleDepositIfDue } from '../lib/stayDeposit.js';
import { emailStayParties } from '../services/stayNotify.js';
import { notify as notifyPush } from '../services/push.js';
import { missingEssentials, safetyScore } from '../lib/studentSafety.js';

// Operator-only endpoints (x-admin-key = ADMIN_API_KEY). Unset key => 404.
export const adminRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!env.admin.apiKey) return res.sendStatus(404);
  if (req.get('x-admin-key') !== env.admin.apiKey) return res.status(401).json({ error: 'Bad admin key' });
  next();
}

adminRouter.use('/admin', requireAdmin);

// Save the demo landlord's current data as the version the nightly reset
// restores — run this after deliberately changing the demo data.
adminRouter.post('/admin/demo/snapshot', async (_req, res) => {
  const ids = await demoLandlordIds();
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    const s = await takeDemoSnapshot(id);
    out[id] = { properties: s.properties.length, repairs: s.tickets.length, quotes: s.quotes.length, levies: s.levies.length };
  }
  res.json({ snapshots: out });
});

// Reset the demo now instead of waiting for the night.
adminRouter.post('/admin/demo/reset', async (_req, res) => {
  res.json({ reset: await resetAllDemoLandlords() });
});

// ---- Caution-fee protection (stays) ----------------------------------------
// EstateCopilot holds student caution fees. These are the ops steps: see what
// needs paying out or deciding, settle disputes, record payouts.

adminRouter.get('/admin/stay-deposits', async (req, res) => {
  const status = String(req.query.status ?? '');
  const where = ['HELD', 'PROPOSED', 'DISPUTED', 'AGREED', 'RETURNED'].includes(status)
    ? { depositStatus: status as 'HELD' }
    : { depositStatus: { in: ['PROPOSED', 'DISPUTED', 'AGREED'] as ('PROPOSED' | 'DISPUTED' | 'AGREED')[] } };
  const rows = await prisma.shortLetBooking.findMany({
    where,
    include: { property: { select: { title: true } }, reports: { select: { kind: true, author: true, photoUrls: true, confirmedAt: true, responseComment: true } } },
    orderBy: { checkOut: 'asc' },
  });
  const settled = await Promise.all(rows.map((r) => settleDepositIfDue(r)));
  res.json(
    settled.map((b) => ({
      id: b.id,
      property: b.property.title,
      guest: b.guestName,
      guestEmail: b.guestEmail,
      checkOut: b.checkOut,
      depositStatus: b.depositStatus,
      depositAmount: b.depositAmount,
      deduction: b.depositDeduction,
      reason: b.depositDeductionReason,
      dispute: b.depositDisputeNote,
      ...depositSplit(b),
      reports: b.reports,
    })),
  );
});

const resolveSchema = z.object({ deduction: z.number().int().min(0), note: z.string().trim().min(5).max(1000) });

// Decide a disputed caution fee after reviewing both sides' photos.
adminRouter.post('/admin/stay-deposits/:id/resolve', async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = await prisma.shortLetBooking.findUnique({ where: { id: req.params.id }, include: { property: { select: { title: true, landlordId: true } } } });
  if (!b || b.depositStatus !== 'DISPUTED') return res.status(409).json({ error: 'No disputed caution fee on this booking' });
  if (parsed.data.deduction > b.depositAmount) return res.status(400).json({ error: 'Deduction exceeds the deposit' });
  const saved = await prisma.shortLetBooking.update({
    where: { id: b.id },
    data: { depositStatus: 'AGREED', depositDeduction: parsed.data.deduction, depositDeductionReason: `EstateCopilot decision: ${parsed.data.note}` },
  });
  const { toGuest, toHost } = depositSplit(saved);
  await emailStayParties(
    b,
    `Caution-fee decision — ${b.property.title}`,
    `We reviewed the photos and notes from you and your host. Decision: ₦${toGuest.toLocaleString()} comes back to you` + (toHost ? `, ₦${toHost.toLocaleString()} goes to the host` : '') + `.\n\nReason: ${parsed.data.note}\n\nWe'll send your refund shortly.`,
    `EstateCopilot reviewed the caution-fee dispute for ${b.guestName}: ₦${toGuest.toLocaleString()} will be returned` + (toHost ? `, ₦${toHost.toLocaleString()} goes to the host` : '') + `. Reason: ${parsed.data.note}`,
  );
  await notifyPush('landlord', b.property.landlordId, { title: 'Caution-fee dispute decided', body: `${b.guestName}: ₦${toHost.toLocaleString()} to you, ₦${toGuest.toLocaleString()} back to the guest.`, screen: 'stays' });
  res.json({ ...saved, toGuest, toHost });
});

// Record that the agreed amounts have actually been sent.
adminRouter.post('/admin/stay-deposits/:id/returned', async (req, res) => {
  const b = await prisma.shortLetBooking.findUnique({ where: { id: req.params.id }, include: { property: { select: { title: true } } } });
  if (!b || b.depositStatus !== 'AGREED') return res.status(409).json({ error: 'Caution fee is not agreed yet' });
  const saved = await prisma.shortLetBooking.update({ where: { id: b.id }, data: { depositStatus: 'RETURNED', depositSettledAt: new Date() } });
  const { toGuest } = depositSplit(saved);
  await emailStayParties(b, `Caution fee returned — ${b.property.title}`, `We've sent ₦${toGuest.toLocaleString()} of your caution fee back to you. Thanks for staying with EstateCopilot — you can leave a review on your booking page.`, `${b.guestName}'s caution fee (₦${toGuest.toLocaleString()}) has been returned.`);
  res.json(saved);
});

// ---- Student Ambassador safety inspections -----------------------------------

const inspectionSchema = z.object({ passed: z.boolean(), inspectedBy: z.string().trim().min(2).max(80), note: z.string().trim().max(500).optional() });

// After an ambassador visits a student-friendly place: passed => the listing
// shows "Inspected by an EstateCopilot Student Ambassador"; failed clears it.
adminRouter.post('/admin/properties/:id/safety-inspection', async (req, res) => {
  const parsed = inspectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const p = await prisma.property.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Property not found' });
  if (parsed.data.passed && missingEssentials(p.safetyFeatures).length) {
    return res.status(409).json({ error: 'The host has not declared every essential safety feature yet', missing: missingEssentials(p.safetyFeatures) });
  }
  const saved = await prisma.property.update({
    where: { id: p.id },
    data: parsed.data.passed ? { safetyInspectedAt: new Date(), safetyInspectedBy: parsed.data.inspectedBy } : { safetyInspectedAt: null, safetyInspectedBy: null },
  });
  await notifyPush('landlord', p.landlordId, parsed.data.passed
    ? { title: 'Safety inspection passed', body: `${p.title} now shows the Student Ambassador "Inspected" badge.`, screen: 'properties' }
    : { title: 'Safety inspection', body: `${p.title} didn't pass yet${parsed.data.note ? `: ${parsed.data.note}` : ''}.`, screen: 'properties' });
  res.json({ id: saved.id, safetyInspectedAt: saved.safetyInspectedAt, safetyInspectedBy: saved.safetyInspectedBy });
});

// Student-friendly places still waiting for a visit (for the ambassador team).
adminRouter.get('/admin/safety-inspections/pending', async (_req, res) => {
  const rows = await prisma.property.findMany({
    where: { propertyType: 'SHORT_LET', studentFriendly: true, isAdvertised: true, safetyInspectedAt: null },
    select: { id: true, title: true, address: true, lga: true, state: true, nearUniversity: true, safetyFeatures: true, landlord: { select: { name: true, phone: true } } },
  });
  res.json(rows.map((r) => ({ ...r, safetyScore: safetyScore(r.safetyFeatures), missingEssentials: missingEssentials(r.safetyFeatures) })));
});
