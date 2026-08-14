import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { mockCorrespondence, logMockCorrespondence } from '../lib/correspondenceStore.js';
import { requireLandlordAuth } from './landlordAuth.js';

export const correspondenceRouter = Router();
correspondenceRouter.use('/correspondence', requireLandlordAuth);

export { logMockCorrespondence };

const entrySchema = z.object({
  channel: z.enum(['WHATSAPP', 'EMAIL', 'SMS', 'NOTE', 'PORTAL']),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']),
  author: z.string().min(1),
  body: z.string().min(1),
});

// Landlord-side view — includes INTERNAL notes, which tenants never see
// (see routes/tenantPortal.ts for the filtered tenant-facing equivalent).
correspondenceRouter.get('/correspondence/:tenancyId', async (req, res) => {
  if (env.mockMode) {
    return res.json(mockCorrespondence[req.params.tenancyId] ?? []);
  }
  const entries = await prisma.correspondence.findMany({
    where: { tenancyId: req.params.tenancyId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(entries);
});

correspondenceRouter.post('/correspondence/:tenancyId', async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (env.mockMode) {
    const entry = logMockCorrespondence(req.params.tenancyId, parsed.data);
    return res.status(201).json(entry);
  }

  const entry = await prisma.correspondence.create({
    data: { tenancyId: req.params.tenancyId, ...parsed.data },
  });
  res.status(201).json(entry);
});
