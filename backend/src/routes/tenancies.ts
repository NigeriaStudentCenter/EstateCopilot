import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { buildInstallmentSchedule, createPaymentRequest } from '../services/paystackPaymentRequest.js';
import { verifyBvn } from '../services/bvnVerification.js';
import { logMockCorrespondence } from '../lib/correspondenceStore.js';
import { MOCK_TENANCIES, mockPaymentPlans, type MockTenancy } from '../lib/mockTenancies.js';
import { MOCK_PROPERTIES } from '../lib/mockProperties.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { mockAgreements, generateAgreementContent } from '../lib/mockAgreements.js';
import { tenancyLandlordId } from '../lib/ownership.js';

async function logReminderCorrespondence(tenancyId: string, body: string) {
  if (env.mockMode) {
    logMockCorrespondence(tenancyId, { channel: 'WHATSAPP', direction: 'OUTBOUND', author: 'System', body });
    return;
  }
  await prisma.correspondence.create({
    data: { tenancyId, channel: 'WHATSAPP', direction: 'OUTBOUND', author: 'System', body },
  });
}

export const tenanciesRouter = Router();
tenanciesRouter.use('/tenancies', requireLandlordAuth);

// Every route below is scoped to req.landlord.landlordId. Tenancy has no
// direct landlordId column — ownership is resolved by walking
// tenancy -> property -> landlordId (see lib/ownership.ts for the mock-mode
// walk; Prisma mode expresses the same thing as a `property: { landlordId }`
// relation filter).

tenanciesRouter.get('/tenancies', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    return res.json(MOCK_TENANCIES.filter((t) => tenancyLandlordId(t.id) === landlordId));
  }
  const tenancies = await prisma.tenancy.findMany({
    where: { property: { landlordId } },
    include: { tenant: true, property: true },
  });
  res.json(tenancies);
});

const verifyBvnSchema = z.object({
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be exactly 11 digits'),
});

// Resolves the BVN via Paystack, compares the returned name against the
// tenant's name on file, and sets kycStatus accordingly. The BVN itself is
// never stored — see services/bvnVerification.ts for why.
tenanciesRouter.post('/tenancies/:id/verify-bvn', async (req: LandlordAuthedRequest, res) => {
  const parsed = verifyBvnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const tenancy =
      tenancyLandlordId(req.params.id) === landlordId ? MOCK_TENANCIES.find((t) => t.id === req.params.id) : undefined;
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found' });

    let result;
    try {
      result = await verifyBvn(parsed.data.bvn, tenancy.tenantName);
    } catch (err) {
      return res.status(502).json({ error: err instanceof Error ? err.message : 'BVN verification failed' });
    }
    tenancy.kycStatus = result.matched ? 'VERIFIED' : 'FAILED';
    return res.json({ kycStatus: tenancy.kycStatus, matched: result.matched, resolvedName: result.resolvedName });
  }

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: req.params.id, property: { landlordId } },
    include: { tenant: true },
  });
  if (!tenancy) return res.status(404).json({ error: 'Tenancy not found' });

  let result;
  try {
    result = await verifyBvn(parsed.data.bvn, tenancy.tenant.name);
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'BVN verification failed' });
  }
  // kycStatus lives on Tenant, not Tenancy (see schema.prisma) — and
  // Tenant.bvn is deliberately left untouched; only the outcome is stored.
  const kycStatus = result.matched ? 'VERIFIED' : 'FAILED';
  await prisma.tenant.update({ where: { id: tenancy.tenantId }, data: { kycStatus } });
  res.json({ kycStatus, matched: result.matched, resolvedName: result.resolvedName });
});

const REMINDER_WINDOWS = [90, 60, 30];

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Pillar B: which tenancies fall inside a 90/60/30-day reminder window right now.
// Meant to be polled by a daily cron; exposed here as a plain GET so it's easy
// to wire into any scheduler (cron, GitHub Actions, a serverless timer, etc).
tenanciesRouter.get('/tenancies/reminders/due', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    const due = MOCK_TENANCIES.filter((t) => tenancyLandlordId(t.id) === landlordId)
      .map((t) => ({ ...t, daysUntilLeaseEnd: daysUntil(t.leaseEndDate) }))
      .filter((t) => REMINDER_WINDOWS.some((w) => Math.abs(t.daysUntilLeaseEnd - w) <= 3));
    return res.json(due);
  }
  const tenancies = await prisma.tenancy.findMany({ where: { property: { landlordId } }, include: { tenant: true } });
  const due = tenancies
    .map((t) => ({ ...t, daysUntilLeaseEnd: Math.round((t.leaseEnd.getTime() - Date.now()) / 86400000) }))
    .filter((t) => REMINDER_WINDOWS.some((w) => Math.abs(t.daysUntilLeaseEnd - w) <= 3));
  res.json(due);
});

// Sends the 90/60/30-day reminder to every tenancy currently due. This is the
// endpoint a daily cron should call.
tenanciesRouter.post('/tenancies/reminders/run', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  const due = env.mockMode
    ? MOCK_TENANCIES.filter((t) => tenancyLandlordId(t.id) === landlordId)
        .map((t) => ({ ...t, daysUntilLeaseEnd: daysUntil(t.leaseEndDate) }))
        .filter((t) => REMINDER_WINDOWS.some((w) => Math.abs(t.daysUntilLeaseEnd - w) <= 3))
    : [];

  const results = await Promise.all(
    due.map(async (t: any) => {
      const body = `Reminder: your lease at ${t.propertyTitle} renews in ${t.daysUntilLeaseEnd} days. Reply to begin renewal or ask a question.`;
      const result = await sendWhatsAppMessage(t.tenantPhone, body);
      await logReminderCorrespondence(t.id, body);
      return { tenancyId: t.id, tenantName: t.tenantName, daysUntilLeaseEnd: t.daysUntilLeaseEnd, sent: result.sent };
    }),
  );

  res.json({ remindersSent: results.length, results });
});

// Manual single-tenancy reminder (e.g. a "remind now" button in the portal).
tenanciesRouter.post('/tenancies/:id/send-rent-reminder', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  const owns = env.mockMode
    ? tenancyLandlordId(req.params.id) === landlordId
    : !!(await prisma.tenancy.findFirst({ where: { id: req.params.id, property: { landlordId } } }));
  if (!owns) return res.status(404).json({ error: 'Tenancy not found' });

  const daysOut = Number(req.body?.daysOut ?? 30);
  const body = `Reminder: your lease renews in ${daysOut} days. Reply to this message to begin renewal or ask a question.`;
  const result = await sendWhatsAppMessage(req.body?.tenantPhone ?? '2348000000000', body);
  await logReminderCorrespondence(req.params.id, body);
  res.json(result);
});

const paymentPlanSchema = z.object({
  plan: z.enum(['FULL', 'INSTALLMENTS']),
  installmentCount: z.number().int().min(2).max(12).optional(),
  startDate: z.string().optional(),
});

// Pillar B: choose FULL (one Paystack payment request for the whole rent) or
// INSTALLMENTS (rent split N ways, one payment request per installment).
tenanciesRouter.post('/tenancies/:id/payment-plan', async (req: LandlordAuthedRequest, res) => {
  const parsed = paymentPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { plan, startDate } = parsed.data;
  const installmentCount = parsed.data.installmentCount ?? 4;
  const landlordId = req.landlord!.landlordId;

  const tenancy = env.mockMode
    ? tenancyLandlordId(req.params.id) === landlordId
      ? MOCK_TENANCIES.find((t) => t.id === req.params.id)
      : undefined
    : await prisma.tenancy.findFirst({ where: { id: req.params.id, property: { landlordId } }, include: { tenant: true } });

  if (!tenancy) return res.status(404).json({ error: 'Tenancy not found' });

  const tenantEmail = env.mockMode ? (tenancy as any).tenantEmail : (tenancy as any).tenant.email;
  const totalAmount = (tenancy as any).rentAmount;
  const from = startDate ? new Date(startDate) : new Date();

  const schedule =
    plan === 'FULL'
      ? [{ sequence: 1, amount: totalAmount, dueDate: from }]
      : buildInstallmentSchedule({ totalAmount, count: installmentCount, startDate: from });

  const installments = await Promise.all(
    schedule.map(async (row) => {
      const request = await createPaymentRequest({
        tenantEmail: tenantEmail ?? 'tenant@example.com',
        amount: row.amount,
        dueDate: row.dueDate.toISOString(),
        description: `Rent ${plan === 'FULL' ? 'payment' : `installment ${row.sequence}/${schedule.length}`} — ${(tenancy as any).propertyTitle ?? ''}`,
      });
      return { ...row, status: 'PENDING', paystackRequestCode: request.requestCode, paymentLink: request.paymentLink };
    }),
  );

  if (env.mockMode) {
    mockPaymentPlans.set(req.params.id, { plan, installments });
  } else {
    await prisma.tenancy.update({ where: { id: req.params.id }, data: { paymentPlan: plan } });
    await prisma.rentInstallment.deleteMany({ where: { tenancyId: req.params.id } });
    await prisma.rentInstallment.createMany({
      data: installments.map((i) => ({
        tenancyId: req.params.id,
        sequence: i.sequence,
        amount: i.amount,
        dueDate: i.dueDate,
        paystackRequestCode: i.paystackRequestCode,
        paymentLink: i.paymentLink,
      })),
    });
  }

  const first = installments[0];
  const currency = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(first.amount);
  await logReminderCorrespondence(
    req.params.id,
    `Payment plan set: ${plan === 'FULL' ? 'one payment' : `${installments.length} installments`}. Your ${plan === 'FULL' ? 'payment' : 'first installment'} of ${currency} is due ${first.dueDate.toLocaleDateString('en-GB')}. Pay here: ${first.paymentLink}`,
  );

  res.status(201).json({ plan, installments });
});

tenanciesRouter.get('/tenancies/:id/payment-plan', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  const owns = env.mockMode
    ? tenancyLandlordId(req.params.id) === landlordId
    : !!(await prisma.tenancy.findFirst({ where: { id: req.params.id, property: { landlordId } } }));
  if (!owns) return res.status(404).json({ error: 'Tenancy not found' });

  if (env.mockMode) {
    const existing = mockPaymentPlans.get(req.params.id);
    return res.json(existing ?? { plan: 'FULL', installments: [] });
  }
  const tenancy = await prisma.tenancy.findUnique({ where: { id: req.params.id } });
  const installments = await prisma.rentInstallment.findMany({
    where: { tenancyId: req.params.id },
    orderBy: { sequence: 'asc' },
  });
  res.json({ plan: tenancy?.paymentPlan ?? 'FULL', installments });
});

// Landlord-initiated tenancy agreement. The Tenant signs it from their own
// portal (POST /api/tenant/agreement/sign) — the Landlord only sends it and
// views its status here, never signs on the Tenant's behalf.
tenanciesRouter.get('/tenancies/:id/agreement', async (req: LandlordAuthedRequest, res) => {
  if (tenancyLandlordId(req.params.id) !== req.landlord!.landlordId) {
    return res.status(404).json({ error: 'Tenancy not found' });
  }
  const agreement = mockAgreements.get(req.params.id);
  res.json(agreement ?? null);
});

tenanciesRouter.post('/tenancies/:id/agreement', async (req: LandlordAuthedRequest, res) => {
  if (tenancyLandlordId(req.params.id) !== req.landlord!.landlordId) {
    return res.status(404).json({ error: 'Tenancy not found' });
  }

  const existing = mockAgreements.get(req.params.id);
  if (existing?.status === 'SIGNED') {
    return res.status(409).json({ error: 'This tenancy already has a signed agreement.' });
  }

  const content = generateAgreementContent(req.params.id);
  if (!content) return res.status(404).json({ error: 'Tenancy not found' });

  const agreement = { tenancyId: req.params.id, status: 'SENT' as const, content, initiatedAt: new Date().toISOString() };
  mockAgreements.set(req.params.id, agreement);

  const tenancy = MOCK_TENANCIES.find((t) => t.id === req.params.id);
  await logReminderCorrespondence(
    req.params.id,
    `Your tenancy agreement for ${tenancy?.propertyTitle ?? 'your property'} is ready to review and sign in your tenant portal.`,
  );

  res.status(201).json(agreement);
});

const inviteSchema = z.object({
  propertyId: z.string(),
  tenantName: z.string().optional(),
  tenantPhone: z.string().min(7),
  rentAmount: z.number().int().positive().optional(),
  leaseStart: z.string().optional(),
  leaseEnd: z.string().optional(),
});

// The actual "invite a tenant" feature: a landlord picks one of their OWN
// properties, supplies minimal tenant contact info, and gets back a
// shareable link. The tenant fills in their own name/email/password at
// signup (POST /tenant-auth/signup already handles a pre-existing tenancyId
// with no email on file — this just creates that pending record for it to
// attach to).
tenanciesRouter.post('/tenancies/invite', async (req: LandlordAuthedRequest, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;
  const { propertyId, tenantName, tenantPhone, rentAmount, leaseStart, leaseEnd } = parsed.data;

  if (env.mockMode) {
    const property = MOCK_PROPERTIES.find((p) => p.id === propertyId && p.landlordId === landlordId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const tenancy: MockTenancy = {
      id,
      propertyId,
      propertyTitle: property.title,
      tenantName: tenantName ?? '',
      tenantPhone,
      tenantEmail: '',
      leaseEndDate: leaseEnd ?? '',
      paymentStatus: 'PENDING',
      rentAmount: rentAmount ?? property.rentAmount,
      discoArrears: 0,
      lgLevyStatus: 'CLEARED',
      kycStatus: 'PENDING',
    };
    MOCK_TENANCIES.push(tenancy);
    return res.status(201).json({ tenancyId: id, inviteUrl: `${env.tenantPortal.baseUrl}/?code=${id}` });
  }

  const property = await prisma.property.findFirst({ where: { id: propertyId, landlordId } });
  if (!property) return res.status(404).json({ error: 'Property not found' });

  const tenant = await prisma.tenant.create({ data: { name: tenantName ?? 'Pending tenant', phone: tenantPhone } });
  const tenancy = await prisma.tenancy.create({
    data: {
      propertyId,
      tenantId: tenant.id,
      leaseStart: leaseStart ? new Date(leaseStart) : new Date(),
      leaseEnd: leaseEnd ? new Date(leaseEnd) : new Date(Date.now() + 365 * 86400000),
      rentAmount: rentAmount ?? property.rentAmount,
      paymentStatus: 'PENDING',
    },
  });
  res.status(201).json({ tenancyId: tenancy.id, inviteUrl: `${env.tenantPortal.baseUrl}/?code=${tenancy.id}` });
});
