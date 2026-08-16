import { Router } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { propertyLandlordId } from '../lib/ownership.js';

export const leviesRouter = Router();
leviesRouter.use('/levies', requireLandlordAuth);

const MOCK_LEVIES: Record<string, unknown[]> = {
  p1: [
    { type: 'TENEMENT_RATE', authority: 'Eti-Osa LGA', amountDue: 180000, status: 'CLEARED', periodLabel: '2026 Assessment' },
    { type: 'LAWMA_ENVIRONMENTAL', authority: 'LAWMA', amountDue: 24000, status: 'CLEARED', periodLabel: 'Q2 2026' },
  ],
  p3: [
    { type: 'TENEMENT_RATE', authority: 'Port Harcourt City LGA', amountDue: 210000, status: 'ARREARS', periodLabel: '2026 Assessment' },
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
  const levies = await prisma.levy.findMany({ where: { propertyId: req.params.propertyId } });
  res.json(levies);
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
    const arrears = levies.filter((l: any) => l.status === 'ARREARS');
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
