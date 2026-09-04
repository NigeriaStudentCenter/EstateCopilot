import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createDedicatedVirtualAccount } from '../services/paystack.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { mockLandlords } from '../lib/mockLandlords.js';
import { MOCK_TENANCIES } from '../lib/mockTenancies.js';
import { tenancyLandlordId } from '../lib/ownership.js';
import { recordMockPayment, mockPaymentsForTenancies } from '../lib/mockPayments.js';

export const paymentsRouter = Router();

const dvaSchema = z.object({
  tenancyId: z.string(),
  tenantEmail: z.string().email(),
  tenantPhone: z.string().min(10),
});

// Pillar B: one dedicated virtual account per tenancy, attached to the
// logged-in landlord's own Paystack subaccount (if they've connected one) so
// rent paid here settles directly into the landlord's bank account — never ours.
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

  // Stash the account number on the tenancy so the webhook below can
  // reconcile an incoming charge back to it (customer email is the primary
  // match; this is the fallback).
  if (!env.mockMode) {
    await prisma.tenancy
      .update({ where: { id: parsed.data.tenancyId }, data: { virtualAccountRef: account.accountNumber } })
      .catch((err) => console.error('[payments] could not store virtualAccountRef', err));
  }

  res.json(account);
});

// A landlord's own record of confirmed tenant payments across their
// tenancies. Informational only — the money has already settled to their
// bank via their subaccount by the time these rows exist.
paymentsRouter.get('/payments', requireLandlordAuth, async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const tenancyIds = MOCK_TENANCIES.filter((t) => tenancyLandlordId(t.id) === landlordId).map((t) => t.id);
    const byId = new Map(MOCK_TENANCIES.map((t) => [t.id, t]));
    return res.json(
      mockPaymentsForTenancies(tenancyIds).map((p) => ({
        ...p,
        tenantName: byId.get(p.tenancyId)?.tenantName,
        propertyTitle: byId.get(p.tenancyId)?.propertyTitle,
      })),
    );
  }

  const payments = await prisma.payment.findMany({
    where: { tenancy: { property: { landlordId } } },
    orderBy: { createdAt: 'desc' },
    include: { tenancy: { include: { tenant: true, property: true } } },
  });
  res.json(
    payments.map((p) => ({
      id: p.id,
      tenancyId: p.tenancyId,
      purpose: p.purpose,
      amount: p.amount,
      status: p.status,
      provider: p.provider,
      providerRef: p.providerRef,
      createdAt: p.createdAt,
      tenantName: p.tenancy.tenant?.name,
      propertyTitle: p.tenancy.property?.title,
    })),
  );
});

// Resolve which tenancy a Paystack charge belongs to: by the payer's email
// first, then by the dedicated-account number we stored above.
async function reconcileTenancy(data: any): Promise<string | undefined> {
  const email: string | undefined = data?.customer?.email;
  const receiverAcct: string | undefined =
    data?.authorization?.receiver_bank_account_number ?? data?.receiver_bank_account_number;

  if (env.mockMode) {
    const t = MOCK_TENANCIES.find((x) => email && x.tenantEmail.toLowerCase() === email.toLowerCase());
    return t?.id;
  }

  if (email) {
    const t = await prisma.tenancy.findFirst({ where: { tenant: { email } }, orderBy: { createdAt: 'desc' } });
    if (t) return t.id;
  }
  if (receiverAcct) {
    const t = await prisma.tenancy.findFirst({ where: { virtualAccountRef: receiverAcct } });
    if (t) return t.id;
  }
  return undefined;
}

// Paystack webhook — a receipt notification. Because the dedicated virtual
// account is tied to the landlord's own subaccount, Paystack has already
// settled the money directly to their bank; there's no split to compute and
// no platform balance to move it out of. We just log a Payment row.
paymentsRouter.post('/payments/webhook/paystack', async (req, res) => {
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
  if (event !== 'charge.success') {
    return res.json({ received: true });
  }

  try {
    const data = req.body?.data ?? {};
    const tenancyId = await reconcileTenancy(data);
    const amount = Number(data?.amount) || 0;
    const providerRef: string | undefined = data?.reference;

    if (!tenancyId) {
      console.warn(`[payments] charge.success not reconciled to a tenancy (ref=${providerRef}, email=${data?.customer?.email})`);
      return res.json({ received: true, reconciled: false });
    }

    if (env.mockMode) {
      recordMockPayment({ tenancyId, purpose: 'RENT', amount, status: 'SUCCESSFUL', provider: 'paystack', providerRef });
    } else {
      // Idempotency: Paystack retries webhooks. Skip if we've already stored this ref.
      const existing = providerRef
        ? await prisma.payment.findFirst({ where: { providerRef, provider: 'paystack' } })
        : null;
      if (!existing) {
        await prisma.payment.create({
          data: { tenancyId, purpose: 'RENT', amount, status: 'SUCCESSFUL', provider: 'paystack', providerRef },
        });
      }
    }
    return res.json({ received: true, reconciled: true });
  } catch (err) {
    console.error('[payments] failed to record charge.success', err);
    return res.json({ received: true }); // never make Paystack retry on our bug
  }
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
