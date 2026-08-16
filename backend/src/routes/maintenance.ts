import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { CHECKLISTS, resolveCategory } from '../lib/repairChecklist.js';
import { mockQuotes } from '../lib/mockBookings.js';
import { mockTickets } from '../lib/mockMaintenance.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { ticketLandlordId, quoteLandlordId, propertyLandlordId } from '../lib/ownership.js';

export const maintenanceRouter = Router();

// Public reference data — the same checklist backs the tenant portal's
// checkbox picker and the landlord portal's manual-logging dropdown, so the
// two never drift apart on who's responsible for what. Deliberately NOT
// gated — tenants (who have no landlord session) need this too.
maintenanceRouter.get('/maintenance/checklist', (_req, res) => {
  res.json(CHECKLISTS);
});

// Everything else here is landlord-portal-facing: ticket CRUD, marketplace
// listing, and quotes. Scoped to these two prefixes specifically so
// '/maintenance/checklist' above stays public. Every route below is further
// scoped to req.landlord.landlordId, resolved by walking ticket -> property
// (and for quotes, quote -> ticket -> property) back to a landlordId.
maintenanceRouter.use('/maintenance/tickets', requireLandlordAuth);
maintenanceRouter.use('/maintenance/quotes', requireLandlordAuth);

const ticketSchema = z.object({
  propertyId: z.string(),
  propertyTitle: z.string().optional(),
  raisedBy: z.string().optional(),
  description: z.string().min(3),
  sourceMessage: z.string().optional(),
  categoryId: z.string().optional(),
});

// Pillar C: message-to-task dispatcher — a WhatsApp report ("generator won't
// start", "no water") lands here and becomes a trackable maintenance ticket.
// categoryId (if given) is resolved server-side into a responsibility verdict
// — a tenant or agent picking a category can't misclassify who's on the hook.
maintenanceRouter.post('/maintenance/tickets', async (req: LandlordAuthedRequest, res) => {
  const parsed = ticketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;
  const { categoryId, ...rest } = parsed.data;
  const resolved = categoryId ? resolveCategory(categoryId) : null;

  if (env.mockMode) {
    if (propertyLandlordId(rest.propertyId) !== landlordId) {
      return res.status(404).json({ error: 'Property not found' });
    }
    const ticket = {
      id: `tk_${mockTickets.length + 1}`,
      status: 'OPEN' as const,
      proofPhotoUrls: [],
      tenantSignedOff: false,
      categoryId: resolved?.categoryId ?? null,
      categoryLabel: resolved?.categoryLabel ?? null,
      responsibility: resolved?.responsibility ?? 'UNCLEAR',
      openToMarketplace: false,
      createdAt: new Date().toISOString(),
      ...rest,
    };
    mockTickets.push(ticket);
    return res.status(201).json(ticket);
  }

  const property = await prisma.property.findFirst({ where: { id: rest.propertyId, landlordId } });
  if (!property) return res.status(404).json({ error: 'Property not found' });

  const ticket = await prisma.maintenanceTicket.create({
    data: {
      ...rest,
      categoryId: resolved?.categoryId,
      categoryLabel: resolved?.categoryLabel,
      responsibility: resolved?.responsibility ?? 'UNCLEAR',
    },
  });
  res.status(201).json(ticket);
});

maintenanceRouter.get('/maintenance/tickets', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    return res.json(mockTickets.filter((t) => propertyLandlordId(t.propertyId) === landlordId));
  }
  const tickets = await prisma.maintenanceTicket.findMany({
    where: { property: { landlordId } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tickets);
});

const signOffSchema = z.object({ tenantSignedOff: z.boolean() });

maintenanceRouter.patch('/maintenance/tickets/:id/sign-off', async (req: LandlordAuthedRequest, res) => {
  const parsed = signOffSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const ticket = mockTickets.find((t) => t.id === req.params.id);
    if (!ticket || propertyLandlordId(ticket.propertyId) !== landlordId) {
      return res.status(404).json({ error: 'Not found' });
    }
    ticket.tenantSignedOff = parsed.data.tenantSignedOff;
    ticket.status = parsed.data.tenantSignedOff ? 'RESOLVED' : ticket.status;
    return res.json(ticket);
  }

  const owned = await prisma.maintenanceTicket.findFirst({ where: { id: req.params.id, property: { landlordId } } });
  if (!owned) return res.status(404).json({ error: 'Not found' });

  const ticket = await prisma.maintenanceTicket.update({
    where: { id: req.params.id },
    data: {
      tenantSignedOff: parsed.data.tenantSignedOff,
      status: parsed.data.tenantSignedOff ? 'RESOLVED' : undefined,
      resolvedAt: parsed.data.tenantSignedOff ? new Date() : undefined,
    },
  });
  res.json(ticket);
});

const marketplaceSchema = z.object({ openToMarketplace: z.boolean() });

// Publishing/unpublishing a ticket to the public handyman marketplace page
// (see routes/public.ts GET /public/repair-jobs).
maintenanceRouter.patch('/maintenance/tickets/:id/marketplace', async (req: LandlordAuthedRequest, res) => {
  const parsed = marketplaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const ticket = mockTickets.find((t) => t.id === req.params.id);
    if (!ticket || propertyLandlordId(ticket.propertyId) !== landlordId) {
      return res.status(404).json({ error: 'Not found' });
    }
    ticket.openToMarketplace = parsed.data.openToMarketplace;
    return res.json(ticket);
  }

  const owned = await prisma.maintenanceTicket.findFirst({ where: { id: req.params.id, property: { landlordId } } });
  if (!owned) return res.status(404).json({ error: 'Not found' });

  const ticket = await prisma.maintenanceTicket.update({
    where: { id: req.params.id },
    data: { openToMarketplace: parsed.data.openToMarketplace },
  });
  res.json(ticket);
});

maintenanceRouter.get('/maintenance/tickets/:id/quotes', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    if (ticketLandlordId(req.params.id) !== landlordId) return res.status(404).json({ error: 'Not found' });
    return res.json(mockQuotes.filter((q) => q.maintenanceTicketId === req.params.id));
  }
  const owned = await prisma.maintenanceTicket.findFirst({ where: { id: req.params.id, property: { landlordId } } });
  if (!owned) return res.status(404).json({ error: 'Not found' });
  const quotes = await prisma.repairQuote.findMany({
    where: { maintenanceTicketId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(quotes);
});

const acceptQuoteSchema = z.object({});

maintenanceRouter.patch('/maintenance/quotes/:id/accept', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    if (quoteLandlordId(req.params.id) !== landlordId) return res.status(404).json({ error: 'Not found' });
    const quote = mockQuotes.find((q) => q.id === req.params.id);
    if (!quote) return res.status(404).json({ error: 'Not found' });
    quote.status = 'ACCEPTED';
    const ticket = mockTickets.find((t) => t.id === quote.maintenanceTicketId);
    if (ticket) {
      ticket.status = 'DISPATCHED';
      ticket.artisanName = quote.handymanName;
      ticket.artisanPhone = quote.handymanPhone;
    }
    return res.json({ quote, ticket });
  }

  acceptQuoteSchema.parse(req.body ?? {});
  const owned = await prisma.repairQuote.findFirst({
    where: { id: req.params.id, maintenanceTicket: { property: { landlordId } } },
  });
  if (!owned) return res.status(404).json({ error: 'Not found' });

  const quote = await prisma.repairQuote.update({ where: { id: req.params.id }, data: { status: 'ACCEPTED' } });
  const ticket = await prisma.maintenanceTicket.update({
    where: { id: quote.maintenanceTicketId },
    data: { status: 'DISPATCHED', artisanName: quote.handymanName, artisanPhone: quote.handymanPhone },
  });
  res.json({ quote, ticket });
});
