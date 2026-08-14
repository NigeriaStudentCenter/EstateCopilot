import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createDedicatedVirtualAccount } from '../services/paystack.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { mockLandlords } from '../lib/mockLandlords.js';

export const paymentsRouter = Router();

const dvaSchema = z.object({
  tenancyId: z.string(),
  tenantEmail: z.string().email(),
  tenantPhone: z.string().min(10),
});

// Pillar B: one dedicated virtual account per tenancy, attached to the
// logged-in landlord's own Paystack subaccount (if they've connected one) so
// rent paid here settles directly into their bank account — never ours.
// Landlord-initiated (via the portal); the two webhook routes below are
// called directly by Paystack/Flutterwave and must stay unauthenticated —
// they're gated by signature verification instead.
paymentsRouter.post('/payments/virtual-account', requireLandlordAuth, async (req: LandlordAuthedRequest, res) => {
  const parsed = dvaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const landlordSubaccountCode = env.mockMode
    ? mockLandlords.get(req.landlord!.landlordId)?.paystackSubaccountCode
    : (await prisma.landlord.findUnique({ where: { id: req.landlord!.landlordId } }))?.paystackSubaccountCode ?? undefined;

  const account = await createDedicatedVirtualAccount({ ...parsed.data, landlordSubaccountCode });
  res.json(account);
});

// Paystack webhook — just a receipt notification. Because the dedicated
// virtual account above is tied to the landlord's own subaccount, Paystack
// has already settled the money directly to their bank; there's no split to
// compute and no platform balance to move it out of.
paymentsRouter.post('/payments/webhook/paystack', (req, res) => {
  if (!env.mockMode && env.paystack.secretKey) {
    const signature = req.get('x-paystack-signature');
    const expected = crypto
      .createHmac('sha512', env.paystack.secretKey)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const event = req.body?.event;
  if (event === 'charge.success') {
    // TODO: persist a Payment row here for the landlord's records (amount,
    // tenancy, timestamp) — purely informational, since the money has
    // already landed in the landlord's account by the time this fires.
    return res.json({ received: true });
  }

  res.json({ received: true });
});

// Flutterwave webhook: same reconciliation shape, different signature scheme.
// Docs: https://developer.flutterwave.com/docs/integration-guides/webhooks
paymentsRouter.post('/payments/webhook/flutterwave', (req, res) => {
  if (!env.mockMode && env.flutterwave.secretKey) {
    const signature = req.get('verif-hash');
    if (signature !== env.flutterwave.secretKey) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  res.json({ received: true });
});
