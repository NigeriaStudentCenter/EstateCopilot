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
import { sendEmail } from '../services/email.js';

// The student ID photo stays private: hosts get a flag here and fetch the
// image through GET /short-let-bookings/:id/student-id with their token.
function forHost<T extends { studentIdKey?: string | null }>(b: T) {
  const { studentIdKey, ...rest } = b;
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
    include: { property: { select: { title: true } } },
    orderBy: { checkIn: 'asc' },
  });
  res.json(bookings.map(({ property, ...b }) => ({ ...forHost(b), propertyTitle: property.title })));
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
    return b && shortLetBookingLandlordId(b.id) === landlordId ? { ...b, checkIn: new Date(b.checkIn), checkOut: new Date(b.checkOut), property: MOCK_PROPERTIES.find((p) => p.id === b.propertyId) ?? { title: 'Property' } } : null;
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
  const payment = await createPaymentRequest({
    tenantEmail: booking.guestEmail,
    amount: booking.totalAmount,
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

  await sendEmail(
    booking.guestEmail,
    `Your stay at ${booking.property.title} is approved`,
    `Hi ${booking.guestName},\n\nGood news — the host checked your student ID and approved your stay: ${stay}.\n\n` +
      `Total: ₦${booking.totalAmount.toLocaleString()}\nPay here to confirm: ${payment.paymentLink}\n\n` +
      `Your booking is confirmed as soon as payment clears.\n\nEstateCopilot`,
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
  await sendEmail(
    booking.guestEmail,
    `Update on your stay request — ${booking.property.title}`,
    `Hi ${booking.guestName},\n\nSorry — the host couldn't accept your stay request this time.` +
      (parsed.data.reason ? `\n\nTheir note: ${parsed.data.reason}` : '') +
      `\n\nNo payment was taken. You can find other student-friendly places on EstateCopilot.\n\nEstateCopilot`,
  );
  res.json(forHost(saved));
});
