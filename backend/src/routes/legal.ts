import { Router } from 'express';
import { z } from 'zod';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { MOCK_PROPERTIES } from '../lib/mockProperties.js';
import { LEGAL_CATEGORIES, mockLegalRequests, mockLegalQuotes, type MockLegalRequest } from '../lib/mockLegal.js';
import { propertyLandlordId, legalRequestLandlordId } from '../lib/ownership.js';

export const legalRouter = Router();
legalRouter.use('/legal-requests', requireLandlordAuth);
legalRouter.use('/legal-quotes', requireLandlordAuth);

// This add-on (see the marketing site's "Legal help, without a retainer"
// section) mirrors the handyman-marketplace pattern exactly: a landlord logs
// a legal need against one of their own properties, opens it to the public
// /legal-team marketplace page, and a verified Nigerian lawyer submits a
// proposal — the landlord accepts the one they want. Same shape as
// maintenance tickets + repair quotes, applied to legal work instead of
// repairs. MOCK_MODE only for now, same as the rest of this add-on.

const createSchema = z.object({
  propertyId: z.string(),
  category: z.enum(LEGAL_CATEGORIES),
  description: z.string().min(3),
  raisedBy: z.string().optional(),
});

legalRouter.post('/legal-requests', async (req: LandlordAuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;
  if (propertyLandlordId(parsed.data.propertyId) !== landlordId) {
    return res.status(404).json({ error: 'Property not found' });
  }

  const property = MOCK_PROPERTIES.find((p) => p.id === parsed.data.propertyId);
  const request: MockLegalRequest = {
    id: `lr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    propertyId: parsed.data.propertyId,
    propertyTitle: property?.title,
    category: parsed.data.category,
    description: parsed.data.description,
    raisedBy: parsed.data.raisedBy,
    status: 'OPEN',
    openToMarketplace: false,
    createdAt: new Date().toISOString(),
  };
  mockLegalRequests.push(request);
  res.status(201).json(request);
});

legalRouter.get('/legal-requests', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  res.json(mockLegalRequests.filter((r) => propertyLandlordId(r.propertyId) === landlordId));
});

const marketplaceSchema = z.object({ openToMarketplace: z.boolean() });

legalRouter.patch('/legal-requests/:id/marketplace', async (req: LandlordAuthedRequest, res) => {
  const parsed = marketplaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const request = mockLegalRequests.find((r) => r.id === req.params.id);
  if (!request || propertyLandlordId(request.propertyId) !== req.landlord!.landlordId) {
    return res.status(404).json({ error: 'Not found' });
  }
  request.openToMarketplace = parsed.data.openToMarketplace;
  res.json(request);
});

legalRouter.get('/legal-requests/:id/quotes', async (req: LandlordAuthedRequest, res) => {
  if (legalRequestLandlordId(req.params.id) !== req.landlord!.landlordId) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(mockLegalQuotes.filter((q) => q.legalRequestId === req.params.id));
});

legalRouter.patch('/legal-quotes/:id/accept', async (req: LandlordAuthedRequest, res) => {
  const quote = mockLegalQuotes.find((q) => q.id === req.params.id);
  if (!quote || legalRequestLandlordId(quote.legalRequestId) !== req.landlord!.landlordId) {
    return res.status(404).json({ error: 'Not found' });
  }
  quote.status = 'ACCEPTED';
  const request = mockLegalRequests.find((r) => r.id === quote.legalRequestId);
  if (request) {
    request.status = 'ENGAGED';
    request.engagedLawyerName = quote.lawyerName;
    request.engagedLawyerPhone = quote.lawyerPhone;
    request.engagedLawFirm = quote.lawFirm;
  }
  res.json({ quote, request });
});
