import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { listMockDrafts, mockDrafts, logMockCorrespondence } from '../lib/correspondenceStore.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { tenancyLandlordId } from '../lib/ownership.js';

export const aiDraftsRouter = Router();
aiDraftsRouter.use('/ai-drafts', requireLandlordAuth);

// The landlord's approval inbox: every AI-drafted reply waiting on a human
// decision before it can reach a tenant. GET with no query returns everything;
// ?status=PENDING_REVIEW narrows to what actually needs attention today.
// Scoped to req.landlord.landlordId via each draft's tenancyId — this is
// MOCK_MODE-only today (no Prisma-backed drafts flow exists yet), so the
// scoping only needs the mock-mode ownership walk.
aiDraftsRouter.get('/ai-drafts', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  const status = req.query.status as any;
  const drafts = listMockDrafts(status).filter((d) => tenancyLandlordId(d.tenancyId) === landlordId);
  res.json(drafts);
});

const approveSchema = z.object({
  editedBody: z.string().min(1).optional(),
  reviewedBy: z.string().min(1).default(env.ai.landlordDisplayName),
});

// Approving is the only way a draft ever becomes a real, tenant-visible
// message — this is the human-in-the-loop gate the AI agent can't bypass.
aiDraftsRouter.post('/ai-drafts/:id/approve', async (req: LandlordAuthedRequest, res) => {
  const parsed = approveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const draft = mockDrafts[req.params.id];
  if (!draft || tenancyLandlordId(draft.tenancyId) !== req.landlord!.landlordId) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  if (draft.status !== 'PENDING_REVIEW') {
    return res.status(409).json({ error: `Draft already ${draft.status}` });
  }

  const finalBody = parsed.data.editedBody?.trim() || draft.suggestedBody;
  const entry = logMockCorrespondence(draft.tenancyId, {
    channel: draft.channel,
    direction: 'OUTBOUND',
    author: parsed.data.reviewedBy,
    body: finalBody,
  });

  draft.status = parsed.data.editedBody ? 'EDITED_AND_SENT' : 'APPROVED';
  draft.sentBody = finalBody;
  draft.reviewedBy = parsed.data.reviewedBy;
  draft.reviewedAt = new Date().toISOString();

  res.json({ draft, sent: entry });
});

const rejectSchema = z.object({
  reviewedBy: z.string().min(1).default(env.ai.landlordDisplayName),
});

aiDraftsRouter.post('/ai-drafts/:id/reject', async (req: LandlordAuthedRequest, res) => {
  const parsed = rejectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const draft = mockDrafts[req.params.id];
  if (!draft || tenancyLandlordId(draft.tenancyId) !== req.landlord!.landlordId) {
    return res.status(404).json({ error: 'Draft not found' });
  }

  draft.status = 'REJECTED';
  draft.reviewedBy = parsed.data.reviewedBy;
  draft.reviewedAt = new Date().toISOString();

  res.json({ draft });
});
