import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MOCK_PROPERTIES, type MockProperty } from '../lib/mockProperties.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';

export const propertiesRouter = Router();
// Scoped to '/properties' specifically, not a blanket router-level `.use()`
// — an unscoped one would swallow requests for any other router mounted
// after this one at the same '/api' prefix (see routes/tenantPortal.ts for
// the earlier bug this pattern avoids).
propertiesRouter.use('/properties', requireLandlordAuth);

// Every route below is scoped to req.landlord.landlordId — a landlord can
// only ever see or mutate their own properties, never another landlord's.
// A property that exists but belongs to someone else 404s, same as one that
// doesn't exist at all, so probing IDs reveals nothing.

propertiesRouter.get('/properties', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    return res.json(MOCK_PROPERTIES.filter((p) => p.landlordId === landlordId));
  }
  const properties = await prisma.property.findMany({ where: { landlordId } });
  res.json(properties);
});

propertiesRouter.get('/properties/:id', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    const property = MOCK_PROPERTIES.find((p) => p.id === req.params.id && p.landlordId === landlordId);
    return property ? res.json(property) : res.status(404).json({ error: 'Not found' });
  }
  const property = await prisma.property.findFirst({
    where: { id: req.params.id, landlordId },
    include: { tenancies: true, levies: true },
  });
  return property ? res.json(property) : res.status(404).json({ error: 'Not found' });
});

const createSchema = z.object({
  title: z.string().min(2),
  address: z.string().min(4),
  state: z.string().min(2),
  lga: z.string().min(2),
  propertyType: z.enum(['LONG_TERM', 'SHORT_LET']),
  rentAmount: z.number().int().positive(),
  cautionDepositAmount: z.number().int().min(0),
  municipalId: z.string().optional(),
});

// Lets a landlord add their own property — the piece that was missing
// before: without this, every property a landlord could see was one of the
// pre-seeded demo ones, never something they created themselves.
propertiesRouter.post('/properties', async (req: LandlordAuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const property: MockProperty = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      landlordId,
      ...parsed.data,
      isAdvertised: false,
      imageUrls: [],
    };
    MOCK_PROPERTIES.push(property);
    return res.status(201).json(property);
  }

  const property = await prisma.property.create({ data: { ...parsed.data, landlordId } });
  res.status(201).json(property);
});

const updateSchema = z.object({
  isAdvertised: z.boolean().optional(),
  listingDescription: z.string().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
});

// Toggling isAdvertised is what actually publishes/unpublishes a property on
// the public marketing site's listings page (see routes/public.ts).
propertiesRouter.patch('/properties/:id', async (req: LandlordAuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const property = MOCK_PROPERTIES.find((p) => p.id === req.params.id && p.landlordId === landlordId);
    if (!property) return res.status(404).json({ error: 'Not found' });
    Object.assign(property, parsed.data);
    return res.json(property);
  }

  const owned = await prisma.property.findFirst({ where: { id: req.params.id, landlordId } });
  if (!owned) return res.status(404).json({ error: 'Not found' });
  const property = await prisma.property.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(property);
});
