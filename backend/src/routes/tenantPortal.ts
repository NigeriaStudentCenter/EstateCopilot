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
import { toTenancyDto, toInstallmentDto } from '../lib/dto.js';
import multer from 'multer';
import sharp from 'sharp';
import { putPropertyImage, putMedia } from '../lib/blobStorage.js';
import { tenancyLandlordId } from '../lib/ownership.js';
import { mockLandlords } from '../lib/mockLandlords.js';
import { notify } from '../services/push.js';

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
    return res.json({ ...toTenancyDto(tenancy), name, email });
  }
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: { tenant: true, property: true },
  });
  if (!tenancy) return res.status(404).json({ error: 'Tenancy not found' });

  const levyArrears = await prisma.levy.count({
    where: { propertyId: tenancy.propertyId, status: 'ARREARS' },
  });
  res.json({
    ...toTenancyDto(tenancy, { lgLevyStatus: levyArrears > 0 ? 'ARREARS' : 'CLEARED' }),
    // The tenant portal also shows the signed-in tenant's own name/email.
    name: tenancy.tenant.name,
    email: tenancy.tenant.email ?? email ?? '',
  });
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
  let landlordName: string | undefined;
  if (env.mockMode) {
    const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
    propertyTitle = tenancy?.propertyTitle ?? '';
    landlordName = mockLandlords.get(tenancyLandlordId(tenancyId) ?? '')?.name;
    entry = logMockCorrespondence(tenancyId, { channel, direction: 'INBOUND', author: name, body });
  } else {
    const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId }, include: { property: { include: { landlord: true } } } });
    propertyTitle = tenancy?.property?.title ?? '';
    landlordName = tenancy?.property?.landlord?.name;
    entry = await prisma.correspondence.create({
      data: { tenancyId, channel, direction: 'INBOUND', author: name, body },
    });
  }

  const suggestedBody = await draftReply({ tenantName: name, propertyTitle, tenantMessage: body, repairContext, landlordName });

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
    return res.json({
      plan: existing?.plan ?? 'FULL',
      installments: (existing?.installments ?? []).map(toInstallmentDto),
    });
  }
  const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId } });
  const rows = await prisma.rentInstallment.findMany({ where: { tenancyId }, orderBy: { sequence: 'asc' } });
  res.json({ plan: tenancy?.paymentPlan ?? 'FULL', installments: rows.map(toInstallmentDto) });
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

  const landlordId = env.mockMode
    ? tenancyLandlordId(tenancyId)
    : (await prisma.tenancy.findUnique({ where: { id: tenancyId }, include: { property: true } }))?.property.landlordId;
  void notify('landlord', landlordId, {
    title: 'New repair request',
    body: `${name}: ${resolved.categoryLabel ? resolved.categoryLabel + ' — ' : ''}${description}`.slice(0, 180),
    screen: 'repairs',
  });

  res.status(201).json(ticket);
});

// POST /tenant/maintenance/:id/photos — tenant adds photos (multipart field
// "photos", up to 4) to a repair they reported for their home. Photos are
// re-encoded, resized and stripped of metadata (incl. GPS) before storing.
const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.storage.maxImageBytes, files: 4 },
  fileFilter: (_req, file, cb) => cb(null, PHOTO_MIME.has(file.mimetype)),
});

tenantPortalRouter.post('/tenant/maintenance/:id/photos', (req: AuthedRequest, res, next) => {
  photoUpload.array('photos', 4)(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ error: 'Photos must be JPEG, PNG or HEIC and under the size limit (4 max).' });
    next();
  });
}, async (req: AuthedRequest, res) => {
  const { tenancyId } = req.tenant!;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) return res.status(400).json({ error: 'No photos received' });

  let ticket: any;
  if (env.mockMode) {
    const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
    ticket = mockTickets.find((t) => t.id === req.params.id && t.propertyId === tenancy?.propertyId);
  } else {
    const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId } });
    ticket = tenancy
      ? await prisma.maintenanceTicket.findFirst({ where: { id: req.params.id, propertyId: tenancy.propertyId } })
      : null;
  }
  if (!ticket) return res.status(404).json({ error: 'Repair not found' });
  const existing: string[] = ticket.proofPhotoUrls ?? [];
  if (existing.length + files.length > 8) return res.status(400).json({ error: 'A repair can have at most 8 photos.' });

  try {
    const stored = await Promise.all(files.map(async (f) => {
      const jpeg = await sharp(f.buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      return putPropertyImage(jpeg);
    }));
    const proofPhotoUrls = [...existing, ...stored.map((s) => s.url)];
    if (env.mockMode) {
      ticket.proofPhotoUrls = proofPhotoUrls;
      return res.status(201).json(ticket);
    }
    const updated = await prisma.maintenanceTicket.update({ where: { id: ticket.id }, data: { proofPhotoUrls } });
    res.status(201).json(updated);
  } catch (e) {
    console.error('[tenant] repair photo upload failed:', e);
    res.status(422).json({ error: 'Could not process one of those photos — try a different one.' });
  }
});

// POST /tenant/maintenance/:id/voice — a voice note describing the problem
// (multipart field "audio", one m4a/aac recording, max 3 per repair). For
// tenants who'd rather say it than type it; the landlord can play it back.
const AUDIO_MIME = new Set(['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, AUDIO_MIME.has(file.mimetype)),
});

tenantPortalRouter.post('/tenant/maintenance/:id/voice', (req: AuthedRequest, res, next) => {
  voiceUpload.single('audio')(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ error: 'Voice notes must be under 5 MB.' });
    next();
  });
}, async (req: AuthedRequest, res) => {
  const { tenancyId } = req.tenant!;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No recording received' });

  let ticket: any;
  if (env.mockMode) {
    const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
    ticket = mockTickets.find((t) => t.id === req.params.id && t.propertyId === tenancy?.propertyId);
  } else {
    const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId } });
    ticket = tenancy ? await prisma.maintenanceTicket.findFirst({ where: { id: req.params.id, propertyId: tenancy.propertyId } }) : null;
  }
  if (!ticket) return res.status(404).json({ error: 'Repair not found' });
  const existing: string[] = ticket.voiceNoteUrls ?? [];
  if (existing.length >= 3) return res.status(400).json({ error: 'A repair can have at most 3 voice notes.' });

  const ext = file.mimetype.includes('wav') ? 'wav' : file.mimetype.includes('mpeg') ? 'mp3' : 'm4a';
  const stored = await putMedia(file.buffer, ext, ext === 'm4a' ? 'audio/mp4' : file.mimetype);
  const voiceNoteUrls = [...existing, stored.url];
  if (env.mockMode) {
    ticket.voiceNoteUrls = voiceNoteUrls;
    return res.status(201).json(ticket);
  }
  const updated = await prisma.maintenanceTicket.update({ where: { id: ticket.id }, data: { voiceNoteUrls } });
  res.status(201).json(updated);
});
