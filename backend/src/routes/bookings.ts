import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { mockBookings } from '../lib/mockBookings.js';
import { MOCK_PROPERTIES } from '../lib/mockProperties.js';
import { mockTickets } from './maintenance.js';
import { requireLandlordAuth } from './landlordAuth.js';

export const bookingsRouter = Router();
bookingsRouter.use('/bookings', requireLandlordAuth);

// The "calendar" ops view — every property viewing and repair site-visit
// request, one list, soonest first. Enriched with a display label so the
// landlord portal doesn't need a second round-trip per row.
bookingsRouter.get('/bookings', async (_req, res) => {
  if (env.mockMode) {
    const enriched = mockBookings.map((b) => ({
      ...b,
      label:
        b.type === 'PROPERTY_VIEWING'
          ? MOCK_PROPERTIES.find((p) => p.id === b.propertyId)?.title ?? 'Property'
          : mockTickets.find((t) => t.id === b.maintenanceTicketId)?.description ?? 'Repair job',
    }));
    enriched.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return res.json(enriched);
  }
  const bookings = await prisma.booking.findMany({
    include: { property: true, maintenanceTicket: true },
    orderBy: { scheduledFor: 'asc' },
  });
  res.json(
    bookings.map((b) => ({
      ...b,
      label: b.type === 'PROPERTY_VIEWING' ? b.property?.title : b.maintenanceTicket?.description,
    })),
  );
});

const statusSchema = z.object({ status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']) });

bookingsRouter.patch('/bookings/:id', async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (env.mockMode) {
    const booking = mockBookings.find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Not found' });
    booking.status = parsed.data.status;
    return res.json(booking);
  }

  const booking = await prisma.booking.update({ where: { id: req.params.id }, data: { status: parsed.data.status } });
  res.json(booking);
});
