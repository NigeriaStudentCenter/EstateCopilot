import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { propertyLandlordId } from '../lib/ownership.js';

export const leviesRouter = Router();
leviesRouter.use('/levies', requireLandlordAuth);

interface MockLevy {
  id: string;
  type: string;
  authority: string;
  amountDue: number;
  status: 'CLEARED' | 'ARREARS';
  periodLabel: string;
  clearedAt?: string;
}

const MOCK_LEVIES: Record<string, MockLevy[]> = {
  p1: [
    { id: 'lv_p1_1', type: 'TENEMENT_RATE', authority: 'Eti-Osa LGA', amountDue: 180000, status: 'CLEARED', periodLabel: '2026 Assessment' },
    { id: 'lv_p1_2', type: 'LAWMA_ENVIRONMENTAL', authority: 'LAWMA', amountDue: 24000, status: 'CLEARED', periodLabel: 'Q2 2026' },
  ],
  p3: [
    { id: 'lv_p3_1', type: 'TENEMENT_RATE', authority: 'Port Harcourt City LGA', amountDue: 210000, status: 'ARREARS', periodLabel: '2026 Assessment' },
  ],
};

leviesRouter.get('/levies/:propertyId', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    if (propertyLandlordId(req.params.propertyId) !== landlordId) {
      return res.status(404).json({ error: 'Property not found' });
    }
    return res.json(MOCK_LEVIES[req.params.propertyId] ?? []);
  }
  const owned = await prisma.property.findFirst({ where: { id: req.params.propertyId, landlordId } });
  if (!owned) return res.status(404).json({ error: 'Property not found' });
  const levies = await prisma.levy.findMany({ where: { propertyId: req.params.propertyId }, orderBy: { createdAt: 'desc' } });
  res.json(levies);
});

const createLevySchema = z.object({
  type: z.string().min(2), // TENEMENT_RATE | LAWMA_ENVIRONMENTAL | OTHER (free text tolerated)
  authority: z.string().min(2),
  amountDue: z.number().int().positive(),
  periodLabel: z.string().min(2),
  status: z.enum(['CLEARED', 'ARREARS']).optional(),
});

leviesRouter.post('/levies/:propertyId', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  const parsed = createLevySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { type, authority, amountDue, periodLabel } = parsed.data;
  const status = parsed.data.status ?? 'ARREARS';

  if (env.mockMode) {
    if (propertyLandlordId(req.params.propertyId) !== landlordId) {
      return res.status(404).json({ error: 'Property not found' });
    }
    const row: MockLevy = {
      id: `lv_${req.params.propertyId}_${Date.now()}`,
      type,
      authority,
      amountDue,
      status,
      periodLabel,
      clearedAt: status === 'CLEARED' ? new Date().toISOString() : undefined,
    };
    MOCK_LEVIES[req.params.propertyId] = [row, ...(MOCK_LEVIES[req.params.propertyId] ?? [])];
    return res.status(201).json(row);
  }

  const owned = await prisma.property.findFirst({ where: { id: req.params.propertyId, landlordId } });
  if (!owned) return res.status(404).json({ error: 'Property not found' });
  const levy = await prisma.levy.create({
    data: {
      propertyId: req.params.propertyId,
      type,
      authority,
      amountDue,
      status,
      periodLabel,
      clearedAt: status === 'CLEARED' ? new Date() : null,
    },
  });
  res.status(201).json(levy);
});

const updateLevySchema = z.object({ status: z.enum(['CLEARED', 'ARREARS']) });

leviesRouter.patch('/levies/:propertyId/:levyId', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  const parsed = updateLevySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { status } = parsed.data;

  if (env.mockMode) {
    if (propertyLandlordId(req.params.propertyId) !== landlordId) {
      return res.status(404).json({ error: 'Property not found' });
    }
    const list = MOCK_LEVIES[req.params.propertyId] ?? [];
    const levy = list.find((l) => l.id === req.params.levyId);
    if (!levy) return res.status(404).json({ error: 'Levy not found' });
    levy.status = status;
    levy.clearedAt = status === 'CLEARED' ? new Date().toISOString() : undefined;
    return res.json(levy);
  }

  const owned = await prisma.property.findFirst({ where: { id: req.params.propertyId, landlordId } });
  if (!owned) return res.status(404).json({ error: 'Property not found' });
  const levy = await prisma.levy.updateMany({
    where: { id: req.params.levyId, propertyId: req.params.propertyId },
    data: { status, clearedAt: status === 'CLEARED' ? new Date() : null },
  });
  if (levy.count === 0) return res.status(404).json({ error: 'Levy not found' });
  res.json(await prisma.levy.findUnique({ where: { id: req.params.levyId } }));
});

// Pillar D: the exit-audit gate. Caution deposit release is blocked until
// electricity balance, tenement rate, and LAWMA dues all clear.
leviesRouter.get('/levies/:propertyId/exit-audit', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    if (propertyLandlordId(req.params.propertyId) !== landlordId) {
      return res.status(404).json({ error: 'Property not found' });
    }
    const levies = MOCK_LEVIES[req.params.propertyId] ?? [];
    const arrears = levies.filter((l) => l.status === 'ARREARS');
    return res.json({
      clearToRelease: arrears.length === 0,
      blockingItems: arrears,
    });
  }
  const owned = await prisma.property.findFirst({ where: { id: req.params.propertyId, landlordId } });
  if (!owned) return res.status(404).json({ error: 'Property not found' });
  const levies = await prisma.levy.findMany({ where: { propertyId: req.params.propertyId } });
  const arrears = levies.filter((l) => l.status === 'ARREARS');
  res.json({ clearToRelease: arrears.length === 0, blockingItems: arrears });
});
