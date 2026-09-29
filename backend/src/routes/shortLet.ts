import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MOCK_PROPERTIES } from '../lib/mockProperties.js';
import { mockShortLetBookings } from '../lib/mockShortLet.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { shortLetBookingLandlordId } from '../lib/ownership.js';
import { getPrivateDoc } from '../lib/blobStorage.js';
import { createPaymentRequest } from '../services/paystackPaymentRequest.js';
import { emailStayParties } from '../services/stayNotify.js';
import { settleDepositIfDue, depositSplit, depositResponseDeadline, DEPOSIT_RESPONSE_DAYS } from '../lib/stayDeposit.js';
import { reportPhotosUpload, reportSchema, storeReportPhotos } from '../lib/stayReports.js';

// The student ID photo stays private: hosts get a flag here and fetch the
// image through GET /short-let-bookings/:id/student-id with their token.
function forHost<T extends { studentIdKey?: string | null; manageToken?: string | null }>(b: T) {
  const { studentIdKey, manageToken, ...rest } = b;
  return { ...rest, hasStudentId: Boolean(studentIdKey) };
}

export const shortLetRouter = Router();
shortLetRouter.use('/short-let-bookings', requireLandlordAuth);

// Every stay booking across the landlord's SHORT_LET properties, soonest
// check-in first — the landlord portal builds both the list view and the
// per-property calendar from this one response.
shortLetRouter.get('/short-let-bookings', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const enriched = mockShortLetBookings
      .filter((b) => shortLetBookingLandlordId(b.id) === landlordId)
      .map((b) => ({ ...forHost(b), propertyTitle: MOCK_PROPERTIES.find((p) => p.id === b.propertyId)?.title ?? 'Property' }));
    enriched.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return res.json(enriched);
  }

  const bookings = await prisma.shortLetBooking.findMany({
    where: { property: { landlordId } },
    include: {
      property: { select: { title: true } },
      _count: { select: { issues: { where: { status: 'OPEN' } }, reports: true } },
    },
    orderBy: { checkIn: 'asc' },
  });
  res.json(
    bookings.map(({ property, manageToken, _count, ...b }) => ({
      ...forHost(b),
      propertyTitle: property.title,
      openIssues: _count.issues,
      reportCount: _count.reports,
    })),
  );
});

const statusSchema = z.object({ status: z.enum(['CANCELLED', 'COMPLETED']) });

// Landlords can cancel (e.g. a guest asked to bail before paying) or mark a
// stay completed after checkout. CONFIRMED itself is set only by the
// Paystack webhook once payment actually clears (see routes/payments.ts).
shortLetRouter.patch('/short-let-bookings/:id', async (req: LandlordAuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const booking = mockShortLetBookings.find((b) => b.id === req.params.id);
    if (!booking || shortLetBookingLandlordId(booking.id) !== landlordId) {
      return res.status(404).json({ error: 'Not found' });
    }
    booking.status = parsed.data.status;
    return res.json(booking);
  }

  const owned = await prisma.shortLetBooking.findFirst({ where: { id: req.params.id, property: { landlordId } } });
  if (!owned) return res.status(404).json({ error: 'Not found' });

  const booking = await prisma.shortLetBooking.update({ where: { id: req.params.id }, data: { status: parsed.data.status } });
  res.json(forHost(booking));
});

// ---- Student stay requests ---------------------------------------------------

async function ownedBooking(id: string, landlordId: string) {
  if (env.mockMode) {
    const b = mockShortLetBookings.find((x) => x.id === id);
    return b && shortLetBookingLandlordId(b.id) === landlordId ? { ...b, checkIn: new Date(b.checkIn), checkOut: new Date(b.checkOut), property: MOCK_PROPERTIES.find((p) => p.id === b.propertyId) ?? { title: 'Property' } } as any : null;
  }
  return prisma.shortLetBooking.findFirst({ where: { id, property: { landlordId } }, include: { property: { select: { title: true } } } });
}

shortLetRouter.get('/short-let-bookings/:id/student-id', async (req: LandlordAuthedRequest, res) => {
  const booking = await ownedBooking(req.params.id, req.landlord!.landlordId);
  if (!booking || !booking.studentIdKey) return res.status(404).json({ error: 'No student ID on this booking' });
  const doc = await getPrivateDoc(booking.studentIdKey);
  if (!doc) return res.status(404).json({ error: 'Student ID file is missing' });
  res.setHeader('Content-Type', doc.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(doc.buffer);
});

// Host is happy with the student ID: issue the payment link and email it.
// The dates were already held while the request waited.
shortLetRouter.post('/short-let-bookings/:id/approve', async (req: LandlordAuthedRequest, res) => {
  const booking = await ownedBooking(req.params.id, req.landlord!.landlordId);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  if (booking.status !== 'AWAITING_APPROVAL') return res.status(409).json({ error: 'This request has already been handled.' });

  const stay = `${booking.nights} night${booking.nights === 1 ? '' : 's'} (${booking.checkIn.toDateString()} to ${booking.checkOut.toDateString()})`;
  const sponsorPays = booking.payer === 'SPONSOR' && booking.sponsorEmail;
  const deposit = booking.depositAmount ?? 0;
  const payment = await createPaymentRequest({
    tenantEmail: sponsorPays ? booking.sponsorEmail! : booking.guestEmail,
    amount: booking.totalAmount + deposit,
    dueDate: booking.checkIn.toISOString().slice(0, 10),
    description: `${booking.property.title} — ${stay}`,
  });
  const update = { status: 'PENDING_PAYMENT' as const, paymentRef: payment.requestCode, paymentLink: payment.paymentLink };

  let saved: any;
  if (env.mockMode) {
    const m = mockShortLetBookings.find((x) => x.id === booking.id)!;
    Object.assign(m, update);
    saved = m;
  } else {
    saved = await prisma.shortLetBooking.update({ where: { id: booking.id }, data: update });
  }

  const money = `Stay: ₦${booking.totalAmount.toLocaleString()}` + (deposit ? `\nCaution fee (held by EstateCopilot, returned after checkout): ₦${deposit.toLocaleString()}` : '') + `\nTotal: ₦${(booking.totalAmount + deposit).toLocaleString()}`;
  await emailStayParties(
    booking,
    `Your stay at ${booking.property.title} is approved`,
    `Good news — the host checked your student ID and approved your stay: ${stay}.\n\n${money}\n\n` +
      (sponsorPays ? `We've sent the payment link to ${booking.sponsorName}.` : `Pay here to confirm: ${payment.paymentLink}`) +
      `\n\nYour booking is confirmed as soon as payment clears.`,
    `${booking.guestName}'s stay at ${booking.property.title} (${stay}) has been approved by the host.\n\n${money}\n\n` +
      (sponsorPays ? `Pay here to confirm their place: ${payment.paymentLink}` : `${booking.guestName} will pay using their own link.`),
  );
  res.json(forHost(saved));
});

const declineSchema = z.object({ reason: z.string().trim().max(300).optional() });

shortLetRouter.post('/short-let-bookings/:id/decline', async (req: LandlordAuthedRequest, res) => {
  const parsed = declineSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const booking = await ownedBooking(req.params.id, req.landlord!.landlordId);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  if (booking.status !== 'AWAITING_APPROVAL') return res.status(409).json({ error: 'This request has already been handled.' });

  const update = { status: 'CANCELLED' as const, hostNote: parsed.data.reason };
  let saved: any;
  if (env.mockMode) {
    const m = mockShortLetBookings.find((x) => x.id === booking.id)!;
    Object.assign(m, update);
    saved = m;
  } else {
    saved = await prisma.shortLetBooking.update({ where: { id: booking.id }, data: update });
  }
  await emailStayParties(
    booking,
    `Update on your stay request — ${booking.property.title}`,
    `Sorry — the host couldn't accept your stay request this time.` +
      (parsed.data.reason ? `\n\nTheir note: ${parsed.data.reason}` : '') +
      `\n\nNo payment was taken. You can find other student places on EstateCopilot: ${env.marketplace.listingsUrl}/stays?student=1`,
    `The host couldn't accept ${booking.guestName}'s stay request at ${booking.property.title}. No payment was taken.`,
  );
  res.json(forHost(saved));
});

// ---- Stay management (reports, caution fee, issues) -------------------------

// Full picture of one stay for the host: reports, issues, review, sponsor,
// caution-fee status. (The student ID stays behind its own route.)
shortLetRouter.get('/short-let-bookings/:id', async (req: LandlordAuthedRequest, res) => {
  if (env.mockMode) return res.status(501).json({ error: 'Not available in demo mode' });
  const found = await prisma.shortLetBooking.findFirst({
    where: { id: req.params.id, property: { landlordId: req.landlord!.landlordId } },
    include: {
      property: { select: { title: true, cautionDepositAmount: true } },
      reports: { orderBy: { createdAt: 'asc' } },
      issues: { orderBy: { createdAt: 'desc' } },
      review: true,
    },
  });
  if (!found) return res.status(404).json({ error: 'Not found' });
  const b = await settleDepositIfDue(found);
  const { property, manageToken, ...rest } = b;
  res.json({
    ...forHost(rest),
    propertyTitle: property.title,
    deposit: {
      ...depositSplit(b),
      responseDeadline: depositResponseDeadline(b.depositProposedAt),
      canPropose: b.depositStatus === 'HELD' && (b.status === 'COMPLETED' || b.checkOut <= new Date()),
    },
  });
});

// Host files a check-in or check-out report (multipart: photos[] + items JSON).
shortLetRouter.post('/short-let-bookings/:id/reports', reportPhotosUpload, async (req: LandlordAuthedRequest, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = await prisma.shortLetBooking.findFirst({ where: { id: req.params.id, property: { landlordId: req.landlord!.landlordId } } });
  if (!b) return res.status(404).json({ error: 'Not found' });
  if (b.status !== 'CONFIRMED' && b.status !== 'COMPLETED') return res.status(409).json({ error: 'Reports can be filed once the stay is confirmed.' });
  const photoUrls = await storeReportPhotos(req.files as Express.Multer.File[]);
  const report = await prisma.stayReport.create({
    data: { bookingId: b.id, kind: parsed.data.kind, author: 'HOST', items: parsed.data.items, notes: parsed.data.notes, photoUrls },
  });
  await emailStayParties(
    b,
    `${parsed.data.kind === 'CHECK_IN' ? 'Check-in' : 'Check-out'} report for your stay`,
    `Your host has filed a ${parsed.data.kind === 'CHECK_IN' ? 'check-in' : 'check-out'} condition report with ${photoUrls.length} photo(s). Please look through it on your booking page and confirm it's accurate — or say what's wrong. This protects your caution fee.`,
  );
  res.status(201).json(report);
});

const respondSchema = z.object({ agree: z.boolean(), comment: z.string().trim().max(500).optional() });

// Host confirms (or comments on) a report the guest filed.
shortLetRouter.post('/short-let-bookings/:id/reports/:reportId/respond', async (req: LandlordAuthedRequest, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const report = await prisma.stayReport.findFirst({
    where: { id: req.params.reportId, bookingId: req.params.id, author: 'GUEST', booking: { property: { landlordId: req.landlord!.landlordId } } },
  });
  if (!report) return res.status(404).json({ error: 'Not found' });
  const updated = await prisma.stayReport.update({
    where: { id: report.id },
    data: { confirmedAt: parsed.data.agree ? new Date() : null, responseComment: parsed.data.comment ?? (parsed.data.agree ? null : 'Host disagrees') },
  });
  res.json(updated);
});

const proposeSchema = z.object({
  deduction: z.number().int().min(0),
  reason: z.string().trim().max(1000).optional(),
});

// After checkout the host proposes how much of the caution fee goes back.
// Any deduction needs a reason and a check-out report as evidence.
shortLetRouter.post('/short-let-bookings/:id/deposit/propose', async (req: LandlordAuthedRequest, res) => {
  const parsed = proposeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = await prisma.shortLetBooking.findFirst({
    where: { id: req.params.id, property: { landlordId: req.landlord!.landlordId } },
    include: { reports: { where: { kind: 'CHECK_OUT' }, select: { id: true } }, property: { select: { title: true } } },
  });
  if (!b) return res.status(404).json({ error: 'Not found' });
  if (b.depositStatus !== 'HELD') return res.status(409).json({ error: 'There is no caution fee waiting to be returned on this stay.' });
  if (b.status !== 'COMPLETED' && b.checkOut > new Date()) return res.status(409).json({ error: 'You can propose the return after checkout.' });
  const { deduction, reason } = parsed.data;
  if (deduction > b.depositAmount) return res.status(400).json({ error: `The deduction can't be more than the ₦${b.depositAmount.toLocaleString()} caution fee.` });
  if (deduction > 0 && (!reason || reason.length < 10)) return res.status(400).json({ error: 'Explain each deduction (what was damaged and what it costs to fix).' });
  if (deduction > 0 && b.reports.length === 0) return res.status(400).json({ error: 'File a check-out report with photos before deducting anything — it is the evidence the student and EstateCopilot will look at.' });

  const saved = await prisma.shortLetBooking.update({
    where: { id: b.id },
    data: { depositStatus: 'PROPOSED', depositDeduction: deduction, depositDeductionReason: deduction ? reason : null, depositProposedAt: new Date() },
  });
  const back = b.depositAmount - deduction;
  await emailStayParties(
    b,
    `Your caution fee — ${b.property.title}`,
    deduction
      ? `Your host proposes returning ₦${back.toLocaleString()} of your ₦${b.depositAmount.toLocaleString()} caution fee, keeping ₦${deduction.toLocaleString()} for: ${reason}\n\nIf you agree, accept on your booking page. If you don't, dispute it within ${DEPOSIT_RESPONSE_DAYS} days and EstateCopilot will review the photos from both sides. If you do nothing, the proposal is accepted after ${DEPOSIT_RESPONSE_DAYS} days.`
      : `Good news — your host proposes returning your full ₦${b.depositAmount.toLocaleString()} caution fee. Accept on your booking page and we'll send it back to you.`,
    deduction
      ? `The host proposes returning ₦${back.toLocaleString()} of ${b.guestName}'s ₦${b.depositAmount.toLocaleString()} caution fee (deduction: ₦${deduction.toLocaleString()} — ${reason}). ${b.guestName} can accept or dispute it within ${DEPOSIT_RESPONSE_DAYS} days.`
      : `The host proposes returning ${b.guestName}'s full ₦${b.depositAmount.toLocaleString()} caution fee.`,
  );
  res.json(forHost(saved));
});

const issueUpdateSchema = z.object({ status: z.enum(['OPEN', 'RESOLVED']), hostReply: z.string().trim().max(500).optional() });

shortLetRouter.patch('/short-let-bookings/:id/issues/:issueId', async (req: LandlordAuthedRequest, res) => {
  const parsed = issueUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const issue = await prisma.stayIssue.findFirst({
    where: { id: req.params.issueId, bookingId: req.params.id, booking: { property: { landlordId: req.landlord!.landlordId } } },
    include: { booking: true },
  });
  if (!issue) return res.status(404).json({ error: 'Not found' });
  const updated = await prisma.stayIssue.update({
    where: { id: issue.id },
    data: { status: parsed.data.status, hostReply: parsed.data.hostReply, resolvedAt: parsed.data.status === 'RESOLVED' ? new Date() : null },
  });
  if (parsed.data.status === 'RESOLVED') {
    await emailStayParties(
      issue.booking,
      'Your host marked a problem as fixed',
      `Your host marked this as fixed: "${issue.description}".` + (parsed.data.hostReply ? `\n\nTheir note: ${parsed.data.hostReply}` : '') + `\n\nIf it isn't fixed, report it again on your booking page.`,
    );
  }
  res.json(updated);
});
