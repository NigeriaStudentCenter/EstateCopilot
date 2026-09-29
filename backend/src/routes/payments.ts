import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { emailStayParties } from '../services/stayNotify.js';
import { notify as notifyPush } from '../services/push.js';
import { prisma } from '../lib/prisma.js';
import { createDedicatedVirtualAccount } from '../services/paystack.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { mockLandlords } from '../lib/mockLandlords.js';
import { MOCK_TENANCIES } from '../lib/mockTenancies.js';
import { tenancyLandlordId } from '../lib/ownership.js';
import { recordMockPayment, mockPaymentsForTenancies } from '../lib/mockPayments.js';
import { mockShortLetBookings } from '../lib/mockShortLet.js';
import { reconcileMarketplacePayment } from '../services/artisanPayments.js';

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

// Short-let stays aren't tenancies, so a charge that doesn't match one above
// is checked against pending stay bookings next — matched by the payment
// request reference we generated and stored at booking time (routes/public.ts),
// which is far more reliable than trying to match a one-off guest by email.
async function reconcileShortLetBooking(providerRef: string | undefined): Promise<string | undefined> {
  if (!providerRef) return undefined;
  if (env.mockMode) {
    const b = mockShortLetBookings.find((x) => x.paymentRef === providerRef && x.status === 'PENDING_PAYMENT');
    return b?.id;
  }
  const b = await prisma.shortLetBooking.findFirst({ where: { paymentRef: providerRef, status: 'PENDING_PAYMENT' } });
  return b?.id;
}

// Payment cleared for a stay: confirm it, start holding the caution fee, and
// tell the guest, their sponsor and the host. Idempotent — only a
// PENDING_PAYMENT booking changes.
async function confirmStayBooking(bookingId: string): Promise<boolean> {
  const b = await prisma.shortLetBooking.findUnique({ where: { id: bookingId }, include: { property: { select: { title: true, address: true, lga: true, landlordId: true } } } });
  if (!b) return false;
  const { count } = await prisma.shortLetBooking.updateMany({
    where: { id: bookingId, status: 'PENDING_PAYMENT' },
    data: { status: 'CONFIRMED', ...(b.depositAmount > 0 ? { depositStatus: 'HELD' } : {}) },
  });
  if (!count) return false;
  const dates = `${b.checkIn.toDateString()} to ${b.checkOut.toDateString()}`;
  await Promise.allSettled([
    emailStayParties(
      b,
      `Booking confirmed — ${b.property.title}`,
      `Payment received — your stay is confirmed (${dates}).\n\nAddress: ${b.property.address}, ${b.property.lga}. Your host's contact is on your booking page.` +
        (b.depositAmount ? `\n\nYour ₦${b.depositAmount.toLocaleString()} caution fee is held safely by EstateCopilot and returned after checkout. Take photos of the room when you move in and add them to your booking page — they protect your caution fee.` : ''),
      `Payment received — ${b.guestName}'s stay at ${b.property.title} is confirmed (${dates}).` +
        (b.depositAmount ? ` The ₦${b.depositAmount.toLocaleString()} caution fee is held by EstateCopilot, not the landlord.` : ''),
    ),
    notifyPush('landlord', b.property.landlordId, { title: 'Stay confirmed', body: `${b.guestName} paid for ${b.property.title} (${dates}).`, screen: 'stays' }),
  ]);
  return true;
}

async function reconcilePaymentRequest(code: string | undefined): Promise<string | undefined> {
  if (!code || env.mockMode) return undefined;
  const booking = await prisma.shortLetBooking.findFirst({ where: { paymentRef: code } });
  if (booking) {
    await confirmStayBooking(booking.id);
    return 'short-let-booking';
  }
  const inst = await prisma.rentInstallment.findFirst({ where: { paystackRequestCode: code } });
  if (inst) {
    await prisma.rentInstallment.updateMany({ where: { id: inst.id, status: { not: 'PAID' } }, data: { status: 'PAID', paidAt: new Date() } });
    return 'rent-installment';
  }
  console.warn(`[payments] paymentrequest.success for unknown request ${code}`);
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

  // A Payment Request (short-let stays, rent instalments) was paid. This
  // event carries our request_code; charge.success does not.
  if (event === 'paymentrequest.success') {
    try {
      const code: string | undefined = req.body?.data?.request_code;
      const kind = await reconcilePaymentRequest(code);
      return res.json({ received: true, reconciled: Boolean(kind), kind });
    } catch (err) {
      console.error('[payments] paymentrequest.success failed', err);
      return res.status(500).json({ error: 'reconcile failed' });
    }
  }

  if (event !== 'charge.success') {
    return res.json({ received: true });
  }

  try {
    const data = req.body?.data ?? {};
    const amountKobo = Number(data?.amount) || 0;
    const amount = Math.round(amountKobo / 100); // stored in naira, like every other amount
    const providerRef: string | undefined = data?.reference;

    // Marketplace payments (agent fees, artisan jobs) carry our own reference
    // and are checked FIRST — otherwise a tenant paying an agent fee would be
    // matched to their tenancy by email and logged as rent.
    const marketplace = await reconcileMarketplacePayment(providerRef, amountKobo);
    if (marketplace.handled) return res.json({ received: true, reconciled: true, kind: marketplace.kind });

    const tenancyId = await reconcileTenancy(data);

    if (!tenancyId) {
      const bookingId = await reconcileShortLetBooking(providerRef);
      if (!bookingId) {
        console.warn(`[payments] charge.success not reconciled to a tenancy or short-let booking (ref=${providerRef}, email=${data?.customer?.email})`);
        return res.json({ received: true, reconciled: false });
      }
      if (env.mockMode) {
        const booking = mockShortLetBookings.find((b) => b.id === bookingId);
        if (booking) booking.status = 'CONFIRMED';
      } else {
        await confirmStayBooking(bookingId);
      }
      return res.json({ received: true, reconciled: true, kind: 'short-let-booking' });
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
