import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MOCK_PROPERTIES } from '../lib/mockProperties.js';
import { requireLandlordAuth } from './landlordAuth.js';

export const propertiesRouter = Router();
// Scoped to '/properties' specifically, not a blanket router-level `.use()`
// — an unscoped one would swallow requests for any other router mounted
// after this one at the same '/api' prefix (see routes/tenantPortal.ts for
// the earlier bug this pattern avoids).
propertiesRouter.use('/properties', requireLandlordAuth);

propertiesRouter.get('/properties', async (_req, res) => {
  if (env.mockMode) {
    return res.json(MOCK_PROPERTIES);
  }
  const properties = await prisma.property.findMany({ include: { landlord: true } });
  res.json(properties);
});

propertiesRouter.get('/properties/:id', async (req, res) => {
  if (env.mockMode) {
    const property = MOCK_PROPERTIES.find((p) => p.id === req.params.id);
    return property ? res.json(property) : res.status(404).json({ error: 'Not found' });
  }
  const property = await prisma.property.findUnique({
    where: { id: req.params.id },
    include: { landlord: true, tenancies: true, levies: true },
  });
  return property ? res.json(property) : res.status(404).json({ error: 'Not found' });
});

const updateSchema = z.object({
  isAdvertised: z.boolean().optional(),
  listingDescription: z.string().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
});

// Toggling isAdvertised is what actually publishes/unpublishes a property on
// the public marketing site's listings page (see routes/public.ts).
propertiesRouter.patch('/properties/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (env.mockMode) {
    const property = MOCK_PROPERTIES.find((p) => p.id === req.params.id);
    if (!property) return res.status(404).json({ error: 'Not found' });
    Object.assign(property, parsed.data);
    return res.json(property);
  }

  const property = await prisma.property.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(property);
});
