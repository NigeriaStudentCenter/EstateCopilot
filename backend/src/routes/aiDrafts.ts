import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { listMockDrafts, mockDrafts, logMockCorrespondence } from '../lib/correspondenceStore.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { tenancyLandlordId } from '../lib/ownership.js';
import { sendEmail } from '../services/email.js';
import { notify } from '../services/push.js';

export const aiDraftsRouter = Router();
aiDraftsRouter.use('/ai-drafts', requireLandlordAuth);

const STATUSES = new Set(['PENDING_REVIEW', 'APPROVED', 'EDITED_AND_SENT', 'REJECTED']);

// The landlord's approval inbox: every AI-drafted reply waiting on a human
// decision before it can reach a tenant. GET with no query returns everything;
// ?status=PENDING_REVIEW narrows to what actually needs attention today.
// Scoped to the signed-in landlord through each draft's tenancy.
aiDraftsRouter.get('/ai-drafts', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  const status = STATUSES.has(req.query.status as string) ? (req.query.status as any) : undefined;
  if (env.mockMode) {
    return res.json(listMockDrafts(status).filter((d) => tenancyLandlordId(d.tenancyId) === landlordId));
  }
  const drafts = await prisma.correspondenceDraft.findMany({
    where: { tenancy: { property: { landlordId } }, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  res.json(drafts);
});

const approveSchema = z.object({
  editedBody: z.string().min(1).optional(),
  reviewedBy: z.string().min(1).optional(),
});

// Approving is the only way a draft ever becomes a real, tenant-visible
// message — this is the human-in-the-loop gate the AI agent can't bypass.
aiDraftsRouter.post('/ai-drafts/:id/approve', async (req: LandlordAuthedRequest, res) => {
  const parsed = approveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const reviewedBy = parsed.data.reviewedBy ?? req.landlord!.name ?? env.ai.landlordDisplayName;

  if (env.mockMode) {
    const draft = mockDrafts[req.params.id];
    if (!draft || tenancyLandlordId(draft.tenancyId) !== req.landlord!.landlordId) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    if (draft.status !== 'PENDING_REVIEW') {
      return res.status(409).json({ error: `Draft already ${draft.status}` });
    }
    const finalBody = parsed.data.editedBody?.trim() || draft.suggestedBody;
    const entry = logMockCorrespondence(draft.tenancyId, { channel: draft.channel, direction: 'OUTBOUND', author: reviewedBy, body: finalBody });
    draft.status = parsed.data.editedBody ? 'EDITED_AND_SENT' : 'APPROVED';
    draft.sentBody = finalBody;
    draft.reviewedBy = reviewedBy;
    draft.reviewedAt = new Date().toISOString();
    return res.json({ draft, sent: entry });
  }

  const draft = await prisma.correspondenceDraft.findFirst({
    where: { id: req.params.id, tenancy: { property: { landlordId: req.landlord!.landlordId } } },
    include: { tenancy: { include: { tenant: true, property: true } } },
  });
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  if (draft.status !== 'PENDING_REVIEW') {
    return res.status(409).json({ error: `Draft already ${draft.status}` });
  }
  const finalBody = parsed.data.editedBody?.trim() || draft.suggestedBody;
  const [entry, updated] = await prisma.$transaction([
    prisma.correspondence.create({
      data: { tenancyId: draft.tenancyId, channel: draft.channel, direction: 'OUTBOUND', author: reviewedBy, body: finalBody },
    }),
    prisma.correspondenceDraft.update({
      where: { id: draft.id },
      data: {
        status: parsed.data.editedBody ? 'EDITED_AND_SENT' : 'APPROVED',
        sentBody: finalBody,
        reviewedBy,
        reviewedAt: new Date(),
      },
    }),
  ]);

  // Deliver it: the reply shows in the tenant portal/app, and goes by email
  // and push so the tenant actually sees it.
  const tenant = draft.tenancy.tenant;
  if (tenant?.email) {
    void sendEmail(tenant.email, `Reply from your landlord about ${draft.tenancy.property.title}`, `${finalBody}\n\n— sent via EstateCopilot`);
  }
  void notify('tenant', tenant?.id, { title: `Reply from ${reviewedBy.split(' ')[0]}`, body: finalBody.slice(0, 140), screen: 'home' });

  res.json({ draft: updated, sent: entry });
});

aiDraftsRouter.post('/ai-drafts/:id/reject', async (req: LandlordAuthedRequest, res) => {
  const reviewedBy = req.landlord!.name ?? env.ai.landlordDisplayName;
  if (env.mockMode) {
    const draft = mockDrafts[req.params.id];
    if (!draft || tenancyLandlordId(draft.tenancyId) !== req.landlord!.landlordId) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    draft.status = 'REJECTED';
    draft.reviewedBy = reviewedBy;
    draft.reviewedAt = new Date().toISOString();
    return res.json({ draft });
  }
  const draft = await prisma.correspondenceDraft.findFirst({
    where: { id: req.params.id, tenancy: { property: { landlordId: req.landlord!.landlordId } } },
  });
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  const updated = await prisma.correspondenceDraft.update({
    where: { id: draft.id },
    data: { status: 'REJECTED', reviewedBy, reviewedAt: new Date() },
  });
  res.json({ draft: updated });
});
