import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { buildInstallmentSchedule, createPaymentRequest } from '../services/paystackPaymentRequest.js';
import { logMockCorrespondence } from '../lib/correspondenceStore.js';
import { MOCK_TENANCIES, mockPaymentPlans } from '../lib/mockTenancies.js';
import { requireLandlordAuth } from './landlordAuth.js';
import { mockAgreements, generateAgreementContent } from '../lib/mockAgreements.js';

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

tenanciesRouter.get('/tenancies', async (_req, res) => {
  if (env.mockMode) {
    return res.json(MOCK_TENANCIES);
  }
  const tenancies = await prisma.tenancy.findMany({
    include: { tenant: true, property: true },
  });
  res.json(tenancies);
});

const REMINDER_WINDOWS = [90, 60, 30];

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Pillar B: which tenancies fall inside a 90/60/30-day reminder window right now.
// Meant to be polled by a daily cron; exposed here as a plain GET so it's easy
// to wire into any scheduler (cron, GitHub Actions, a serverless timer, etc).
tenanciesRouter.get('/tenancies/reminders/due', async (_req, res) => {
  if (env.mockMode) {
    const due = MOCK_TENANCIES.map((t) => ({ ...t, daysUntilLeaseEnd: daysUntil(t.leaseEndDate) }))
      .filter((t) => REMINDER_WINDOWS.some((w) => Math.abs(t.daysUntilLeaseEnd - w) <= 3));
    return res.json(due);
  }
  const tenancies = await prisma.tenancy.findMany({ include: { tenant: true } });
  const due = tenancies
    .map((t) => ({ ...t, daysUntilLeaseEnd: Math.round((t.leaseEnd.getTime() - Date.now()) / 86400000) }))
    .filter((t) => REMINDER_WINDOWS.some((w) => Math.abs(t.daysUntilLeaseEnd - w) <= 3));
  res.json(due);
});

// Sends the 90/60/30-day reminder to every tenancy currently due. This is the
// endpoint a daily cron should call.
tenanciesRouter.post('/tenancies/reminders/run', async (_req, res) => {
  const due = env.mockMode
    ? MOCK_TENANCIES.map((t) => ({ ...t, daysUntilLeaseEnd: daysUntil(t.leaseEndDate) })).filter((t) =>
        REMINDER_WINDOWS.some((w) => Math.abs(t.daysUntilLeaseEnd - w) <= 3),
      )
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
tenanciesRouter.post('/tenancies/:id/send-rent-reminder', async (req, res) => {
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
tenanciesRouter.post('/tenancies/:id/payment-plan', async (req, res) => {
  const parsed = paymentPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { plan, startDate } = parsed.data;
  const installmentCount = parsed.data.installmentCount ?? 4;

  const tenancy = env.mockMode
    ? MOCK_TENANCIES.find((t) => t.id === req.params.id)
    : await prisma.tenancy.findUnique({ where: { id: req.params.id }, include: { tenant: true } });

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

tenanciesRouter.get('/tenancies/:id/payment-plan', async (req, res) => {
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
tenanciesRouter.get('/tenancies/:id/agreement', async (req, res) => {
  const agreement = mockAgreements.get(req.params.id);
  res.json(agreement ?? null);
});

tenanciesRouter.post('/tenancies/:id/agreement', async (req, res) => {
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
