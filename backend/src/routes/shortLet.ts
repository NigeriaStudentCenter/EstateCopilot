import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MOCK_PROPERTIES } from '../lib/mockProperties.js';
import { mockShortLetBookings } from '../lib/mockShortLet.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { shortLetBookingLandlordId } from '../lib/ownership.js';

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
      .map((b) => ({ ...b, propertyTitle: MOCK_PROPERTIES.find((p) => p.id === b.propertyId)?.title ?? 'Property' }));
    enriched.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return res.json(enriched);
  }

  const bookings = await prisma.shortLetBooking.findMany({
    where: { property: { landlordId } },
    include: { property: true },
    orderBy: { checkIn: 'asc' },
  });
  res.json(bookings.map((b) => ({ ...b, propertyTitle: b.property.title })));
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
  res.json(booking);
});
