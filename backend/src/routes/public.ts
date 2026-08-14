import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MOCK_PROPERTIES } from '../lib/mockProperties.js';
import { mockTickets } from './maintenance.js';
import { createMockBooking, createMockQuote } from '../lib/mockBookings.js';
import { notifyOps } from '../lib/notifyOps.js';

// Everything in this file is unauthenticated — it's what the public
// marketing site (properties page, handyman marketplace page) talks to.
export const publicRouter = Router();

// ---- Property listings --------------------------------------------------

publicRouter.get('/public/properties', async (_req, res) => {
  if (env.mockMode) {
    return res.json(MOCK_PROPERTIES.filter((p) => p.isAdvertised));
  }
  const properties = await prisma.property.findMany({ where: { isAdvertised: true } });
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

  res.status(201).json(booking);
});

// ---- Handyman marketplace -------------------------------------------------

function toPublicJob(t: any) {
  // Deliberately omits the exact street address and tenant identity —
  // handymen see enough to quote (LGA, state, category, description), full
  // address is shared only once a quote is accepted.
  return {
    id: t.id,
    propertyTitle: t.propertyTitle,
    description: t.description,
    categoryLabel: t.categoryLabel,
    responsibility: t.responsibility,
    status: t.status,
    createdAt: t.createdAt,
  };
}

publicRouter.get('/public/repair-jobs', async (_req, res) => {
  if (env.mockMode) {
    const jobs = mockTickets.filter((t) => t.openToMarketplace && t.status !== 'RESOLVED');
    return res.json(jobs.map(toPublicJob));
  }
  const jobs = await prisma.maintenanceTicket.findMany({
    where: { openToMarketplace: true, status: { not: 'RESOLVED' } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(jobs.map(toPublicJob));
});

publicRouter.get('/public/repair-jobs/:id', async (req, res) => {
  if (env.mockMode) {
    const job = mockTickets.find((t) => t.id === req.params.id && t.openToMarketplace);
    return job ? res.json(toPublicJob(job)) : res.status(404).json({ error: 'Job not found' });
  }
  const job = await prisma.maintenanceTicket.findFirst({ where: { id: req.params.id, openToMarketplace: true } });
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

  let job;
  let quote;
  if (env.mockMode) {
    job = mockTickets.find((t) => t.id === req.params.id && t.openToMarketplace);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    quote = createMockQuote({ maintenanceTicketId: job.id, ...parsed.data });
  } else {
    job = await prisma.maintenanceTicket.findFirst({ where: { id: req.params.id, openToMarketplace: true } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    quote = await prisma.repairQuote.create({ data: { maintenanceTicketId: job.id, ...parsed.data } });
  }

  await notifyOps(
    `New repair quote: ${job.description}`,
    `${parsed.data.handymanName} (${parsed.data.handymanPhone}) quoted ₦${parsed.data.amount.toLocaleString()} for "${job.description}".${parsed.data.message ? `\n\nNote: ${parsed.data.message}` : ''}`,
  );

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

  let job;
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
    job = await prisma.maintenanceTicket.findFirst({ where: { id: req.params.id, openToMarketplace: true } });
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

  await notifyOps(
    `Site-visit request: ${job.description}`,
    `${handymanName} (${handymanPhone}) wants to view "${job.description}" (${job.propertyTitle}) on ${new Date(scheduledFor).toLocaleString('en-GB')} before quoting.${message ? `\n\nNote: ${message}` : ''}`,
  );

  res.status(201).json(booking);
});
