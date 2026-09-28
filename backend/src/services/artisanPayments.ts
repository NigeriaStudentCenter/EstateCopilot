import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { notifyOps } from '../lib/notifyOps.js';
import { initializeSplitPayment, splitAmounts } from './paystackSplit.js';
import { sendEmail } from './email.js';
import { notify } from './push.js';
import { alertAgent } from './agentAlerts.js';

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/** Landlord accepted a registered artisan's quote: create the split payment link. Idempotent per quote. */
export async function createArtisanJobPayment(quoteId: string, payerEmail: string) {
  const existing = await prisma.artisanJobPayment.findUnique({ where: { quoteId } });
  if (existing) return existing;
  const quote = await prisma.repairQuote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { artisan: true, maintenanceTicket: { include: { property: true } } },
  });
  if (!quote.artisan) throw new Error('Quote has no registered artisan');
  const pct = env.marketplace.artisanCommissionPercent;
  const { platformAmount, payeeAmount } = splitAmounts(quote.amount, pct);
  const reference = `ECAR_${quote.id}_${Date.now().toString(36)}`;
  const payment = await initializeSplitPayment({
    email: payerEmail,
    amount: quote.amount,
    platformAmount,
    reference,
    subaccountCode: quote.artisan.paystackSubaccountCode,
    callbackUrl: `${env.marketplace.landlordPortalUrl}/maintenance?paid=artisan`,
    metadata: { kind: 'artisan_job', quoteId: quote.id, ticketId: quote.maintenanceTicketId },
  });
  const row = await prisma.artisanJobPayment.create({
    data: {
      quoteId: quote.id,
      artisanId: quote.artisan.id,
      payerEmail,
      amount: quote.amount,
      platformPercent: pct,
      platformAmount,
      artisanAmount: payeeAmount,
      paymentRef: payment.reference,
      paymentLink: payment.paymentLink,
      payoutMethod: payment.payoutMethod,
    },
  });
  void sendEmail(
    payerEmail,
    `Pay for your repair: ${quote.maintenanceTicket.description.slice(0, 60)}`,
    `You accepted ${quote.artisan.businessName ?? quote.artisan.name}'s quote of ${naira(quote.amount)} for "${quote.maintenanceTicket.description}" at ${quote.maintenanceTicket.property.title}.\n\n` +
      `Pay securely through EstateCopilot (Paystack):\n${payment.paymentLink}\n\nEstateCopilot`,
  );
  if (payment.payoutMethod === 'manual') {
    void notifyOps('Artisan has no payout bank yet', `${quote.artisan.name} (${quote.artisan.phone}) — quote ${naira(quote.amount)} accepted. If the landlord pays before the artisan adds a bank account, pay them ${naira(payeeAmount)} manually.`);
  }
  return row;
}

/**
 * Paystack charge.success for a marketplace payment (reference ECAG_… or
 * ECAR_…). Returns true when the reference was ours and has been handled, so
 * the rent reconciliation never mistakes it for rent.
 */
export async function reconcileMarketplacePayment(reference: string | undefined, amountKobo: number): Promise<{ handled: boolean; kind?: string }> {
  if (!reference || env.mockMode) return { handled: false };

  if (reference.startsWith('ECAG_')) {
    const deal = await prisma.agentDeal.findUnique({ where: { paymentRef: reference }, include: { agent: true, property: true } });
    if (!deal) return { handled: true, kind: 'agent-fee-unknown' };
    if (deal.status === 'PAID') return { handled: true, kind: 'agent-fee-duplicate' };
    if (amountKobo < deal.agentFee * 100) {
      void notifyOps('Agent fee UNDERPAID', `Deal ${deal.id}: expected ${naira(deal.agentFee)}, got ${naira(amountKobo / 100)} (ref ${reference}).`);
      return { handled: true, kind: 'agent-fee-underpaid' };
    }
    await prisma.agentDeal.update({ where: { id: deal.id }, data: { status: 'PAID', paidAt: new Date() } });
    await alertAgent(
      deal.agentId,
      { kind: 'DEAL_UPDATE', title: 'Agent fee paid 🎉', body: `${deal.property.title}: the tenant paid ${naira(deal.agentFee)}. ${naira(deal.agentAmount)} is on its way to your bank.`, propertyId: deal.propertyId },
      { to: deal.agent.email, text: `${deal.tenantName} paid the ${naira(deal.agentFee)} agent fee for ${deal.property.title}.\n\nYour share, ${naira(deal.agentAmount)}, is being settled to your bank${deal.payoutMethod === 'split' ? ' by Paystack (usually the next working day)' : ' by our team'}.\n\nEstateCopilot` },
    );
    void notifyOps(
      `Agent fee paid${deal.payoutMethod === 'manual' ? ' — MANUAL PAYOUT NEEDED' : ''}`,
      `${deal.agent.name} / ${deal.property.title}: ${naira(deal.agentFee)} paid. Agent ${naira(deal.agentAmount)}, platform ${naira(deal.platformAmount)}. Payout: ${deal.payoutMethod}.`,
    );
    return { handled: true, kind: 'agent-fee' };
  }

  if (reference.startsWith('ECAR_')) {
    const p = await prisma.artisanJobPayment.findUnique({ where: { paymentRef: reference }, include: { quote: { include: { maintenanceTicket: true } } } });
    if (!p) return { handled: true, kind: 'artisan-job-unknown' };
    if (p.status === 'PAID') return { handled: true, kind: 'artisan-job-duplicate' };
    if (amountKobo < p.amount * 100) {
      void notifyOps('Artisan job UNDERPAID', `Payment ${p.id}: expected ${naira(p.amount)}, got ${naira(amountKobo / 100)} (ref ${reference}).`);
      return { handled: true, kind: 'artisan-job-underpaid' };
    }
    await prisma.artisanJobPayment.update({ where: { id: p.id }, data: { status: 'PAID', paidAt: new Date() } });
    void notify('artisan', p.artisanId, {
      title: 'Payment received',
      body: `The landlord paid ${naira(p.amount)} for "${p.quote.maintenanceTicket.description.slice(0, 60)}". ${naira(p.artisanAmount)} is on its way to your bank.`,
      screen: 'jobs',
    });
    void notifyOps(
      `Artisan job paid${p.payoutMethod === 'manual' ? ' — MANUAL PAYOUT NEEDED' : ''}`,
      `Quote ${p.quoteId}: ${naira(p.amount)} paid. Artisan ${naira(p.artisanAmount)}, platform ${naira(p.platformAmount)}. Payout: ${p.payoutMethod}.`,
    );
    return { handled: true, kind: 'artisan-job' };
  }
  return { handled: false };
}
