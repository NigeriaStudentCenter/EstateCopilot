// The guest's private booking page (/stays/booking/:token on the marketplace).
// No account: the unguessable token from their booking email IS the key, so
// everything here is scoped to exactly one booking. Lets a student (or their
// sponsor, who gets the same link) follow the booking, file/confirm condition
// reports, report problems, accept or dispute the caution-fee return, and
// leave a verified review.
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { notifyOps } from '../lib/notifyOps.js';
import { notify as notifyPush } from '../services/push.js';
import { sendEmail } from '../services/email.js';
import { depositSplit, depositResponseDeadline, settleDepositIfDue } from '../lib/stayDeposit.js';
import { reportPhotosUpload, reportSchema, storeReportPhotos, DEFAULT_REPORT_AREAS } from '../lib/stayReports.js';
import { SAFETY_FEATURES, safetyScore } from '../lib/studentSafety.js';

export const stayGuestRouter = Router();

async function loadByToken(token: string) {
  if (env.mockMode || !token || token.length < 20) return null;
  const b = await prisma.shortLetBooking.findUnique({
    where: { manageToken: token },
    include: {
      property: {
        include: { landlord: { select: { id: true, name: true, email: true, phone: true } } },
      },
      reports: { orderBy: { createdAt: 'asc' } },
      issues: { orderBy: { createdAt: 'desc' } },
      review: true,
    },
  });
  return b ? settleDepositIfDue(b) : null;
}
type LoadedStay = NonNullable<Awaited<ReturnType<typeof loadByToken>>>;

const stayOver = (b: LoadedStay) => b.status === 'COMPLETED' || (b.status === 'CONFIRMED' && b.checkOut <= new Date());

function view(b: LoadedStay) {
  const confirmed = b.status === 'CONFIRMED' || b.status === 'COMPLETED';
  const p = b.property;
  const firstName = (p.landlord.name ?? 'Your host').split(/\s+/)[0];
  return {
    id: b.id,
    status: b.status,
    purpose: b.purpose,
    guestName: b.guestName,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: b.nights,
    rateType: b.rateType,
    totalAmount: b.totalAmount,
    paymentLink: b.status === 'PENDING_PAYMENT' ? b.paymentLink : null,
    payer: b.payer,
    sponsor: b.sponsorName ? { name: b.sponsorName, relationship: b.sponsorRelationship, phone: b.sponsorPhone } : null,
    idCheck: b.idCheck,
    idType: b.idType,
    hostNote: b.hostNote,
    property: {
      id: p.id,
      title: p.title,
      // Exact address + host contact only once the stay is paid for.
      address: confirmed ? `${p.address}, ${p.lga}, ${p.state}` : `${p.lga}, ${p.state}`,
      imageUrls: p.imageUrls,
      houseRules: p.houseRules,
      nearUniversity: p.nearUniversity,
      safetyFeatures: SAFETY_FEATURES.map((f) => ({ ...f, present: p.safetyFeatures.includes(f.key) })),
      safetyScore: safetyScore(p.safetyFeatures),
      safetyInspectedAt: p.safetyInspectedAt,
    },
    host: confirmed ? { name: firstName, phone: p.landlord.phone } : { name: firstName },
    deposit: {
      amount: b.depositAmount,
      status: b.depositStatus,
      deduction: b.depositDeduction,
      reason: b.depositDeductionReason,
      disputeNote: b.depositDisputeNote,
      responseDeadline: depositResponseDeadline(b.depositProposedAt),
      settledAt: b.depositSettledAt,
      ...depositSplit(b),
    },
    reports: b.reports,
    issues: b.issues,
    review: b.review,
    reportAreas: DEFAULT_REPORT_AREAS,
    can: {
      pay: b.status === 'PENDING_PAYMENT' && Boolean(b.paymentLink),
      fileReport: confirmed,
      reportIssue: confirmed && !stayOver(b),
      respondDeposit: b.depositStatus === 'PROPOSED',
      review: stayOver(b) && !b.review,
    },
  };
}

stayGuestRouter.get('/public/stays/:token', async (req, res) => {
  const b = await loadByToken(req.params.token);
  if (!b) return res.status(404).json({ error: 'Booking not found — check the link in your email.' });
  res.json(view(b));
});

async function withStay(req: Request, res: Response): Promise<LoadedStay | null> {
  const b = await loadByToken(req.params.token);
  if (!b) {
    res.status(404).json({ error: 'Booking not found' });
    return null;
  }
  return b;
}

// Guest's own check-in / check-out photos — their protection if the host
// never files one, or files one they disagree with.
stayGuestRouter.post('/public/stays/:token/reports', reportPhotosUpload, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = await withStay(req, res);
  if (!b) return;
  if (!view(b).can.fileReport) return res.status(409).json({ error: 'You can file a report once your stay is confirmed.' });
  const photoUrls = await storeReportPhotos(req.files as Express.Multer.File[]);
  if (!photoUrls.length) return res.status(400).json({ error: 'Add at least one photo.' });
  const report = await prisma.stayReport.create({
    data: { bookingId: b.id, kind: parsed.data.kind, author: 'GUEST', items: parsed.data.items, notes: parsed.data.notes, photoUrls },
  });
  await notifyPush('landlord', b.property.landlord.id, {
    title: `${b.guestName} filed a ${parsed.data.kind === 'CHECK_IN' ? 'check-in' : 'check-out'} report`,
    body: `${b.property.title} — ${photoUrls.length} photo(s). Please confirm it.`,
    screen: 'stays',
  });
  res.status(201).json(report);
});

const respondSchema = z.object({ agree: z.boolean(), comment: z.string().trim().max(500).optional() });

// Guest confirms (or disputes) a report the host filed.
stayGuestRouter.post('/public/stays/:token/reports/:reportId/respond', async (req, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = await withStay(req, res);
  if (!b) return;
  const report = b.reports.find((r) => r.id === req.params.reportId && r.author === 'HOST');
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (!parsed.data.agree && !parsed.data.comment) return res.status(400).json({ error: 'Say what is wrong with the report.' });
  const updated = await prisma.stayReport.update({
    where: { id: report.id },
    data: { confirmedAt: parsed.data.agree ? new Date() : null, responseComment: parsed.data.comment ?? null },
  });
  if (!parsed.data.agree) {
    await notifyPush('landlord', b.property.landlord.id, {
      title: `${b.guestName} disagrees with your report`,
      body: parsed.data.comment!.slice(0, 120),
      screen: 'stays',
    });
  }
  res.json(updated);
});

const issueSchema = z.object({ description: z.string().trim().min(5).max(1000) });

stayGuestRouter.post('/public/stays/:token/issues', async (req, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Describe the problem (at least a few words).' });
  const b = await withStay(req, res);
  if (!b) return;
  if (!view(b).can.reportIssue) return res.status(409).json({ error: 'Problems can be reported during a confirmed stay.' });
  if (b.issues.filter((i) => i.status === 'OPEN').length >= 10) return res.status(429).json({ error: 'You have several open problems already — your host has been notified.' });
  const issue = await prisma.stayIssue.create({ data: { bookingId: b.id, description: parsed.data.description } });
  await Promise.allSettled([
    notifyPush('landlord', b.property.landlord.id, { title: `Problem at ${b.property.title}`, body: `${b.guestName}: ${parsed.data.description.slice(0, 120)}`, screen: 'stays' }),
    b.property.landlord.email
      ? sendEmail(b.property.landlord.email, `Problem reported at ${b.property.title}`, `${b.guestName} (${b.guestPhone}) reported:\n\n${parsed.data.description}\n\nOpen the Stays page in your EstateCopilot portal or app to reply and mark it fixed.`)
      : Promise.resolve(),
  ]);
  res.status(201).json(issue);
});

stayGuestRouter.post('/public/stays/:token/deposit/accept', async (req, res) => {
  const b = await withStay(req, res);
  if (!b) return;
  if (b.depositStatus !== 'PROPOSED') return res.status(409).json({ error: 'There is no caution-fee proposal to accept.' });
  await prisma.shortLetBooking.update({ where: { id: b.id }, data: { depositStatus: 'AGREED' } });
  const { toGuest, toHost } = depositSplit(b);
  await notifyOps(
    `Caution fee ready to pay out — ${b.guestName}`,
    `${b.guestName} accepted the host's proposal for ${b.property.title}. Send ₦${toGuest.toLocaleString()} back to the guest` +
      (toHost ? ` and ₦${toHost.toLocaleString()} to the host` : '') +
      `, then mark booking ${b.id} RETURNED (POST /api/admin/stay-deposits/${b.id}/returned).`,
  );
  const fresh = await loadByToken(req.params.token);
  res.json(view(fresh!));
});

const disputeSchema = z.object({ note: z.string().trim().min(10).max(1500) });

stayGuestRouter.post('/public/stays/:token/deposit/dispute', async (req, res) => {
  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Explain why you disagree (at least a sentence).' });
  const b = await withStay(req, res);
  if (!b) return;
  if (b.depositStatus !== 'PROPOSED') return res.status(409).json({ error: 'There is no caution-fee proposal to dispute.' });
  await prisma.shortLetBooking.update({ where: { id: b.id }, data: { depositStatus: 'DISPUTED', depositDisputeNote: parsed.data.note } });
  await notifyOps(
    `Caution-fee dispute — ${b.guestName} at ${b.property.title}`,
    `Deposit ₦${b.depositAmount.toLocaleString()}; host wants to keep ₦${(b.depositDeduction ?? 0).toLocaleString()} for: ${b.depositDeductionReason}\n\nStudent says: ${parsed.data.note}\n\nReview both sides' check-in/check-out photos, then decide: POST /api/admin/stay-deposits/${b.id}/resolve {"deduction": N, "note": "..."}.`,
  );
  await notifyPush('landlord', b.property.landlord.id, {
    title: 'Caution fee disputed',
    body: `${b.guestName} disputed the deduction. EstateCopilot will review both sides' photos.`,
    screen: 'stays',
  });
  const fresh = await loadByToken(req.params.token);
  res.json(view(fresh!));
});

const reviewSchema = z.object({
  overall: z.number().int().min(1).max(5),
  safety: z.number().int().min(1).max(5),
  host: z.number().int().min(1).max(5),
  value: z.number().int().min(1).max(5),
  accuracy: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1500).optional(),
});

// One verified review per stay, only after checkout.
stayGuestRouter.post('/public/stays/:token/review', async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Rate each area from 1 to 5.' });
  const b = await withStay(req, res);
  if (!b) return;
  if (!stayOver(b)) return res.status(409).json({ error: 'You can review after your stay ends.' });
  if (b.review) return res.status(409).json({ error: 'You have already reviewed this stay.' });
  const review = await prisma.stayReview.create({
    data: {
      ...parsed.data,
      bookingId: b.id,
      propertyId: b.propertyId,
      guestFirstName: b.guestName.trim().split(/\s+/)[0],
      isStudent: b.purpose === 'STUDENT',
    },
  });
  res.status(201).json(review);
});
