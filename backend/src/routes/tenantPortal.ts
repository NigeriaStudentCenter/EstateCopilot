import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { requireTenantAuth, type AuthedRequest } from './tenantAuth.js';
import { MOCK_TENANCIES, mockPaymentPlans } from '../lib/mockTenancies.js';
import { mockCorrespondence, logMockCorrespondence, createMockDraft } from '../lib/correspondenceStore.js';
import { mockTickets } from '../lib/mockMaintenance.js';
import { resolveCategory } from '../lib/repairChecklist.js';
import { draftReply, type DraftReplyParams } from '../services/aiReply.js';
import { mockAgreements } from '../lib/mockAgreements.js';

export const tenantPortalRouter = Router();
// Scoped to /tenant/* only — an unscoped `.use(requireTenantAuth)` here would
// swallow every request that reaches this router instance regardless of
// whether a route matches, which previously 401'd unrelated routers (public,
// bookings) mounted after this one at the same '/api' prefix.
tenantPortalRouter.use('/tenant', requireTenantAuth);

// Everything below is scoped to req.tenant.tenancyId — a tenant can only
// ever see or act on their own lease, never another tenant's.

tenantPortalRouter.get('/tenant/me', async (req: AuthedRequest, res) => {
  const { tenancyId, name, email } = req.tenant!;
  if (env.mockMode) {
    const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found' });
    return res.json({ ...tenancy, name, email });
  }
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: { tenant: true, property: true },
  });
  res.json(tenancy);
});

tenantPortalRouter.get('/tenant/agreement', async (req: AuthedRequest, res) => {
  const { tenancyId } = req.tenant!;
  res.json(mockAgreements.get(tenancyId) ?? null);
});

const signSchema = z.object({
  fullName: z.string().min(2),
  confirmed: z.literal(true),
});

tenantPortalRouter.post('/tenant/agreement/sign', async (req: AuthedRequest, res) => {
  const parsed = signSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { tenancyId } = req.tenant!;
  const agreement = mockAgreements.get(tenancyId);
  if (!agreement) return res.status(404).json({ error: 'No agreement has been sent for this tenancy yet.' });
  if (agreement.status === 'SIGNED') {
    return res.status(409).json({ error: 'This agreement has already been signed.' });
  }

  agreement.status = 'SIGNED';
  agreement.signedAt = new Date().toISOString();
  agreement.signedByName = parsed.data.fullName.trim();
  mockAgreements.set(tenancyId, agreement);

  res.json(agreement);
});

// Filtered version of GET /api/correspondence/:tenancyId — INTERNAL notes
// (the landlord's private notes-to-self) are never exposed here.
tenantPortalRouter.get('/tenant/correspondence', async (req: AuthedRequest, res) => {
  const { tenancyId } = req.tenant!;
  if (env.mockMode) {
    const thread = (mockCorrespondence[tenancyId] ?? []).filter((e) => e.direction !== 'INTERNAL');
    return res.json(thread);
  }
  const entries = await prisma.correspondence.findMany({
    where: { tenancyId, direction: { not: 'INTERNAL' } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(entries);
});

// Logs an inbound tenant message (a chat message or a repair report) and
// triggers the AI agent to draft a reply, which lands in the landlord's AI
// Inbox until approved. Shared by the correspondence and maintenance routes
// so a repair report also shows up as a message the landlord can reply to.
async function logInboundAndDraft(params: {
  tenancyId: string;
  name: string;
  body: string;
  channel: 'PORTAL' | 'EMAIL' | 'WHATSAPP';
  repairContext?: DraftReplyParams['repairContext'];
}) {
  const { tenancyId, name, body, channel, repairContext } = params;
  let entry;
  let propertyTitle = '';
  if (env.mockMode) {
    const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
    propertyTitle = tenancy?.propertyTitle ?? '';
    entry = logMockCorrespondence(tenancyId, { channel, direction: 'INBOUND', author: name, body });
  } else {
    const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId }, include: { property: true } });
    propertyTitle = tenancy?.property.title ?? '';
    entry = await prisma.correspondence.create({
      data: { tenancyId, channel, direction: 'INBOUND', author: name, body },
    });
  }

  const suggestedBody = await draftReply({ tenantName: name, propertyTitle, tenantMessage: body, repairContext });

  if (env.mockMode) {
    createMockDraft({ tenancyId, inReplyToBody: body, suggestedBody });
  } else {
    await prisma.correspondenceDraft.create({ data: { tenancyId, inReplyToBody: body, suggestedBody } });
  }

  return entry;
}

const messageSchema = z.object({
  body: z.string().min(1),
  channel: z.enum(['PORTAL', 'EMAIL', 'WHATSAPP']).default('PORTAL'),
});

tenantPortalRouter.post('/tenant/correspondence', async (req: AuthedRequest, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { tenancyId, name } = req.tenant!;
  const entry = await logInboundAndDraft({ tenancyId, name, body: parsed.data.body, channel: parsed.data.channel });
  res.status(201).json(entry);
});

tenantPortalRouter.get('/tenant/payment-plan', async (req: AuthedRequest, res) => {
  const { tenancyId } = req.tenant!;
  if (env.mockMode) {
    const existing = mockPaymentPlans.get(tenancyId);
    return res.json(existing ?? { plan: 'FULL', installments: [] });
  }
  const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId } });
  const installments = await prisma.rentInstallment.findMany({ where: { tenancyId }, orderBy: { sequence: 'asc' } });
  res.json({ plan: tenancy?.paymentPlan ?? 'FULL', installments });
});

tenantPortalRouter.get('/tenant/maintenance', async (req: AuthedRequest, res) => {
  const { tenancyId } = req.tenant!;
  if (env.mockMode) {
    const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
    return res.json(mockTickets.filter((t) => t.propertyId === tenancy?.propertyId));
  }
  const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId } });
  const tickets = await prisma.maintenanceTicket.findMany({
    where: { propertyId: tenancy?.propertyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tickets);
});

// categoryId is one of the checklist item ids from GET /api/maintenance/checklist,
// or omitted/"other" for "something else / not sure". Responsibility is always
// resolved server-side from categoryId — the tenant picks a checkbox, not a verdict.
const ticketSchema = z.object({
  description: z.string().min(3),
  categoryId: z.string().optional(),
});

tenantPortalRouter.post('/tenant/maintenance', async (req: AuthedRequest, res) => {
  const parsed = ticketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { tenancyId, name } = req.tenant!;
  const { description, categoryId } = parsed.data;
  const resolved = resolveCategory(categoryId);

  let ticket: any;
  if (env.mockMode) {
    const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found' });
    ticket = {
      id: `tk_${mockTickets.length + 1}`,
      propertyId: tenancy.propertyId,
      propertyTitle: tenancy.propertyTitle,
      raisedBy: name,
      description,
      categoryId: resolved.categoryId,
      categoryLabel: resolved.categoryLabel,
      responsibility: resolved.responsibility,
      sourceMessage: 'Tenant portal',
      status: 'OPEN',
      proofPhotoUrls: [],
      tenantSignedOff: false,
      createdAt: new Date().toISOString(),
    };
    mockTickets.push(ticket);
  } else {
    const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId } });
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found' });
    ticket = await prisma.maintenanceTicket.create({
      data: {
        propertyId: tenancy.propertyId,
        raisedBy: name,
        description,
        categoryId: resolved.categoryId,
        categoryLabel: resolved.categoryLabel,
        responsibility: resolved.responsibility,
        sourceMessage: 'Tenant portal',
      },
    });
  }

  // A repair report is also a message the landlord should see in the same
  // inbox as everything else, with the AI's reply already reflecting who's
  // actually responsible for it.
  await logInboundAndDraft({
    tenancyId,
    name,
    channel: 'PORTAL',
    body: `Reported a repair — "${resolved.categoryLabel}": ${description}`,
    repairContext: { categoryLabel: resolved.categoryLabel, responsibility: resolved.responsibility },
  });

  res.status(201).json(ticket);
});
