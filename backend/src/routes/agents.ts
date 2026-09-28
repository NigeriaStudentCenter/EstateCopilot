import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { NIGERIA_STATES } from '../lib/nigeriaStates.js';
import { notifyOps } from '../lib/notifyOps.js';
import { notDemoProperty } from '../lib/demo.js';
import { sendEmail } from '../services/email.js';
import { notify } from '../services/push.js';
import { resolveBankAccount, createLandlordSubaccount } from '../services/paystackSubaccount.js';
import { initializeSplitPayment, splitAmounts } from '../services/paystackSplit.js';
import {
  requireAgentAuth,
  signAgentToken,
  newAgentCode,
  type AgentAuthedRequest,
} from '../services/agentAuth.js';
import { alertAgent, listingShareUrl } from '../services/agentAlerts.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';

// Agent marketplace — see the Agent model in prisma/schema.prisma for the flow.
export const agentsRouter = Router();

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const STATE_NAMES = new Set(NIGERIA_STATES.map((s) => s.name));
const noMock = (res: any) => res.status(503).json({ error: 'The agent marketplace needs the database (not available in mock mode).' });

// Banks Paystack can settle to — shared by the agent and artisan payout forms.
export const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank (FCMB)', code: '214' },
  { name: 'Guaranty Trust Bank (GTBank)', code: '058' },
  { name: 'Kuda Bank', code: '50211' },
  { name: 'Moniepoint MFB', code: '50515' },
  { name: 'Opay', code: '999992' },
  { name: 'PalmPay', code: '999991' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa (UBA)', code: '033' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
];

agentsRouter.get('/public/banks', (_req, res) => res.json(NIGERIAN_BANKS));

agentsRouter.get('/public/agent-terms', (_req, res) =>
  res.json({ commissionPercent: env.marketplace.agentCommissionPercent, artisanCommissionPercent: env.marketplace.artisanCommissionPercent }),
);

function toAgentDto(a: any) {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    agencyName: a.agencyName,
    licenceNumber: a.licenceNumber,
    states: a.states,
    code: a.code,
    status: a.status,
    bankAccountName: a.bankAccountName,
    bankAccountLast4: a.bankAccountNumber ? a.bankAccountNumber.slice(-4) : null,
    payoutsConnected: !!a.paystackSubaccountCode,
    commissionPercent: env.marketplace.agentCommissionPercent,
    createdAt: a.createdAt,
  };
}

// ---- Registration & sign-in ------------------------------------------------

const statesSchema = z.array(z.string()).min(1).max(37).refine((xs) => xs.every((s) => STATE_NAMES.has(s)), 'Unknown state');

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(10).max(20),
  password: z.string().min(8).max(100),
  agencyName: z.string().trim().max(120).optional(),
  licenceNumber: z.string().trim().max(60).optional(),
  states: statesSchema,
});

agentsRouter.post('/agent-auth/register', async (req, res) => {
  if (env.mockMode) return noMock(res);
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check the form', details: parsed.error.flatten() });
  const d = parsed.data;
  const phone = d.phone.replace(/[^0-9+]/g, '');

  const clash = await prisma.agent.findFirst({ where: { OR: [{ email: d.email }, { phone }] } });
  if (clash) {
    return res.status(409).json({ error: clash.email === d.email ? 'An agent with that email already exists — sign in instead.' : 'That phone number is already registered.' });
  }
  const agent = await prisma.agent.create({
    data: {
      name: d.name,
      email: d.email,
      phone,
      passwordHash: hashPassword(d.password),
      agencyName: d.agencyName || null,
      licenceNumber: d.licenceNumber || null,
      states: d.states,
      code: await newAgentCode(d.name),
    },
  });
  void notifyOps('New agent registered', `${agent.name}${agent.agencyName ? ` (${agent.agencyName})` : ''} — ${agent.email}, ${agent.phone}. States: ${agent.states.join(', ')}.`);
  void sendEmail(
    agent.email!,
    'Welcome to EstateCopilot for agents',
    `Hi ${agent.name.split(' ')[0]},\n\nYou're registered. You'll get an alert whenever a property is listed in ${agent.states.join(', ')}.\n\n` +
      `Share your personal listing links with clients — viewings they request through them come straight to you, and when a deal closes the agent fee is paid through EstateCopilot and your share is sent to your bank automatically.\n\n` +
      `Next step: add your bank account so we can pay you: ${env.marketplace.siteUrl}/agents/dashboard\n\nEstateCopilot`,
  );
  res.status(201).json({ token: signAgentToken({ agentId: agent.id, email: agent.email! }), agent: toAgentDto(agent) });
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

agentsRouter.post('/agent-auth/login', async (req, res) => {
  if (env.mockMode) return noMock(res);
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your email and password' });
  const agent = await prisma.agent.findUnique({ where: { email: parsed.data.email } });
  if (!agent?.passwordHash || !verifyPassword(parsed.data.password, agent.passwordHash)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  if (agent.status !== 'ACTIVE') return res.status(403).json({ error: 'Your agent account is suspended. Contact support.' });
  res.json({ token: signAgentToken({ agentId: agent.id, email: agent.email! }), agent: toAgentDto(agent) });
});

// Public: who shared this link? Shown on the marketplace so the client knows
// their viewing request goes to that agent.
agentsRouter.get('/public/agents/by-code/:code', async (req, res) => {
  if (env.mockMode) return res.status(404).json({ error: 'Not found' });
  const agent = await prisma.agent.findUnique({ where: { code: req.params.code.toUpperCase() } });
  if (!agent || agent.status !== 'ACTIVE') return res.status(404).json({ error: 'Not found' });
  res.json({ code: agent.code, name: agent.name, agencyName: agent.agencyName, states: agent.states });
});

// ---- The agent's own account ---------------------------------------------

agentsRouter.use('/agent', requireAgentAuth);

agentsRouter.get('/agent/me', async (req: AgentAuthedRequest, res) => {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: req.agent!.agentId } });
  const [unread, leadsOpen, dealsOpen, earned] = await Promise.all([
    prisma.agentAlert.count({ where: { agentId: agent.id, readAt: null } }),
    prisma.booking.count({ where: { agentId: agent.id, status: { in: ['REQUESTED', 'CONFIRMED'] } } }),
    prisma.agentDeal.count({ where: { agentId: agent.id, status: { in: ['PENDING_LANDLORD', 'AWAITING_PAYMENT'] } } }),
    prisma.agentDeal.aggregate({ where: { agentId: agent.id, status: 'PAID' }, _sum: { agentAmount: true } }),
  ]);
  res.json({ ...toAgentDto(agent), stats: { unreadAlerts: unread, openLeads: leadsOpen, openDeals: dealsOpen, earned: earned._sum.agentAmount ?? 0 } });
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(10).max(20).optional(),
  agencyName: z.string().trim().max(120).nullable().optional(),
  licenceNumber: z.string().trim().max(60).nullable().optional(),
  states: statesSchema.optional(),
});

agentsRouter.patch('/agent/me', async (req: AgentAuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check the form', details: parsed.error.flatten() });
  const data = { ...parsed.data, ...(parsed.data.phone ? { phone: parsed.data.phone.replace(/[^0-9+]/g, '') } : {}) };
  try {
    const agent = await prisma.agent.update({ where: { id: req.agent!.agentId }, data });
    res.json(toAgentDto(agent));
  } catch {
    res.status(409).json({ error: 'That phone number is already registered to another agent.' });
  }
});

const bankSchema = z.object({ bankCode: z.string().min(3), accountNumber: z.string().regex(/^\d{10}$/, 'Account numbers are 10 digits') });

agentsRouter.post('/agent/bank-details', async (req: AgentAuthedRequest, res) => {
  const parsed = bankSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the bank details' });
  const bank = NIGERIAN_BANKS.find((b) => b.code === parsed.data.bankCode);
  if (!bank) return res.status(400).json({ error: 'Pick your bank from the list' });
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: req.agent!.agentId } });
  let resolved;
  try {
    resolved = await resolveBankAccount(parsed.data.accountNumber, bank.code);
  } catch {
    return res.status(400).json({ error: "We couldn't verify that account number with the bank — please check it." });
  }
  const sub = await createLandlordSubaccount({ businessName: `Agent ${agent.name} — ${bank.name}`, bankCode: bank.code, accountNumber: parsed.data.accountNumber });
  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { bankAccountNumber: parsed.data.accountNumber, bankCode: bank.code, bankAccountName: resolved.accountName, paystackSubaccountCode: sub.subaccountCode },
  });
  res.json(toAgentDto(updated));
});

// Listings in the agent's states, each with their personal share link.
agentsRouter.get('/agent/listings', async (req: AgentAuthedRequest, res) => {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: req.agent!.agentId } });
  const state = typeof req.query.state === 'string' && agent.states.includes(req.query.state) ? req.query.state : undefined;
  const properties = await prisma.property.findMany({
    where: { isAdvertised: true, agentsAllowed: true, state: state ? state : { in: agent.states }, ...(await notDemoProperty()) },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const myLeads = await prisma.booking.groupBy({
    by: ['propertyId'],
    where: { agentId: agent.id, propertyId: { in: properties.map((p) => p.id) } },
    _count: { _all: true },
  });
  const leadsBy = new Map(myLeads.map((l) => [l.propertyId, l._count._all]));
  res.json(
    properties.map((p) => ({
      id: p.id,
      title: p.title,
      address: p.address,
      state: p.state,
      lga: p.lga,
      propertyType: p.propertyType,
      rentAmount: p.rentAmount,
      nightlyRate: p.nightlyRate,
      listingDescription: p.listingDescription,
      imageUrls: p.imageUrls,
      agentFeePercent: p.agentFeePercent,
      agentFee: p.propertyType === 'LONG_TERM' ? Math.round((p.rentAmount * p.agentFeePercent) / 100) : null,
      shareUrl: listingShareUrl(agent.code!, p.id),
      myLeads: leadsBy.get(p.id) ?? 0,
      createdAt: p.createdAt,
    })),
  );
});

agentsRouter.get('/agent/alerts', async (req: AgentAuthedRequest, res) => {
  const alerts = await prisma.agentAlert.findMany({ where: { agentId: req.agent!.agentId }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(alerts);
});

agentsRouter.post('/agent/alerts/read-all', async (req: AgentAuthedRequest, res) => {
  await prisma.agentAlert.updateMany({ where: { agentId: req.agent!.agentId, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

// Viewing requests that came through the agent's links.
agentsRouter.get('/agent/leads', async (req: AgentAuthedRequest, res) => {
  const leads = await prisma.booking.findMany({
    where: { agentId: req.agent!.agentId },
    include: { property: { select: { id: true, title: true, lga: true, state: true, rentAmount: true, agentFeePercent: true, propertyType: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const deals = await prisma.agentDeal.findMany({ where: { agentId: req.agent!.agentId, bookingId: { in: leads.map((l) => l.id) } }, select: { bookingId: true, status: true } });
  const dealBy = new Map(deals.map((d) => [d.bookingId, d.status]));
  res.json(leads.map((l) => ({ ...l, dealStatus: dealBy.get(l.id) ?? null })));
});

const leadUpdateSchema = z.object({ status: z.enum(['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(), notes: z.string().max(1000).optional() });

agentsRouter.patch('/agent/leads/:id', async (req: AgentAuthedRequest, res) => {
  const parsed = leadUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update' });
  const lead = await prisma.booking.findFirst({ where: { id: req.params.id, agentId: req.agent!.agentId } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const updated = await prisma.booking.update({ where: { id: lead.id }, data: parsed.data });
  res.json(updated);
});

// ---- Deals ----------------------------------------------------------------

function toDealDto(d: any) {
  return {
    id: d.id,
    status: d.status,
    property: d.property ? { id: d.property.id, title: d.property.title, lga: d.property.lga, state: d.property.state } : undefined,
    tenantName: d.tenantName,
    tenantEmail: d.tenantEmail,
    tenantPhone: d.tenantPhone,
    annualRent: d.annualRent,
    agentFee: d.agentFee,
    platformPercent: d.platformPercent,
    platformAmount: d.platformAmount,
    agentAmount: d.agentAmount,
    paymentLink: d.status === 'AWAITING_PAYMENT' ? d.paymentLink : null,
    payoutMethod: d.payoutMethod,
    disputeReason: d.disputeReason,
    paidAt: d.paidAt,
    createdAt: d.createdAt,
  };
}

agentsRouter.get('/agent/deals', async (req: AgentAuthedRequest, res) => {
  const deals = await prisma.agentDeal.findMany({ where: { agentId: req.agent!.agentId }, include: { property: true }, orderBy: { createdAt: 'desc' } });
  res.json(deals.map(toDealDto));
});

const dealSchema = z.object({
  propertyId: z.string(),
  bookingId: z.string().optional(),
  tenantName: z.string().trim().min(2).max(100),
  tenantEmail: z.string().trim().toLowerCase().email(),
  tenantPhone: z.string().trim().min(10).max(20),
  annualRent: z.number().int().positive(),
  agentFee: z.number().int().positive().optional(),
});

agentsRouter.post('/agent/deals', async (req: AgentAuthedRequest, res) => {
  const parsed = dealSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check the deal details', details: parsed.error.flatten() });
  const d = parsed.data;
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: req.agent!.agentId } });
  if (!agent.paystackSubaccountCode) {
    return res.status(400).json({ error: 'Add your bank account first (Payouts tab) so your share can be paid to you automatically.', needsBank: true });
  }
  const property = await prisma.property.findUnique({ where: { id: d.propertyId }, include: { landlord: true } });
  if (!property || !property.agentsAllowed || !agent.states.includes(property.state)) {
    return res.status(404).json({ error: 'That property isn’t available to you.' });
  }
  if (d.bookingId) {
    const lead = await prisma.booking.findFirst({ where: { id: d.bookingId, agentId: agent.id, propertyId: property.id } });
    if (!lead) return res.status(400).json({ error: 'That lead isn’t yours or is for a different property.' });
  }
  const open = await prisma.agentDeal.findFirst({ where: { propertyId: property.id, status: { in: ['PENDING_LANDLORD', 'AWAITING_PAYMENT'] } } });
  if (open) return res.status(409).json({ error: 'A deal for this property is already waiting on the landlord or the tenant.' });

  const agentFee = d.agentFee ?? Math.round((d.annualRent * property.agentFeePercent) / 100);
  const pct = env.marketplace.agentCommissionPercent;
  const { platformAmount, payeeAmount } = splitAmounts(agentFee, pct);
  const deal = await prisma.agentDeal.create({
    data: {
      agentId: agent.id,
      propertyId: property.id,
      bookingId: d.bookingId,
      tenantName: d.tenantName,
      tenantEmail: d.tenantEmail,
      tenantPhone: d.tenantPhone.replace(/[^0-9+]/g, ''),
      annualRent: d.annualRent,
      agentFee,
      platformPercent: pct,
      platformAmount,
      agentAmount: payeeAmount,
      landlordToken: crypto.randomBytes(24).toString('base64url'),
    },
    include: { property: true },
  });
  if (d.bookingId) await prisma.booking.update({ where: { id: d.bookingId }, data: { status: 'COMPLETED' } });

  const confirmUrl = `${env.marketplace.siteUrl}/agents/deal/${deal.landlordToken}`;
  void sendEmail(
    property.landlord.email,
    `Please confirm: agent deal for ${property.title}`,
    `Hi ${property.landlord.name.split(' ')[0]},\n\n` +
      `${agent.name}${agent.agencyName ? ` (${agent.agencyName})` : ''}, a registered EstateCopilot agent, says they've found a tenant for ${property.title}:\n\n` +
      `Tenant: ${deal.tenantName} (${deal.tenantPhone}, ${deal.tenantEmail})\nAnnual rent: ${naira(deal.annualRent)}\nAgent fee (paid by the tenant): ${naira(deal.agentFee)}\n\n` +
      `Confirm or dispute it here (one click, no sign-in needed):\n${confirmUrl}\n\n` +
      `Nothing is charged to you. Once you confirm, the tenant gets a secure link to pay the agent fee.\n\nEstateCopilot`,
  );
  void notify('landlord', property.landlordId, { title: 'An agent found you a tenant', body: `${agent.name} recorded a deal for ${property.title}. Check your email to confirm.`, screen: 'home' });
  void notifyOps('Agent deal recorded', `${agent.name} → ${property.title}: tenant ${deal.tenantName}, rent ${naira(deal.annualRent)}, fee ${naira(deal.agentFee)}. Landlord confirm link: ${confirmUrl}`);
  await alertAgent(agent.id, { kind: 'DEAL_UPDATE', title: 'Deal sent to the landlord', body: `${property.title}: waiting for the landlord to confirm.`, propertyId: property.id });

  res.status(201).json(toDealDto(deal));
});

agentsRouter.post('/agent/deals/:id/cancel', async (req: AgentAuthedRequest, res) => {
  const deal = await prisma.agentDeal.findFirst({ where: { id: req.params.id, agentId: req.agent!.agentId } });
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.status !== 'PENDING_LANDLORD' && deal.status !== 'AWAITING_PAYMENT') return res.status(409).json({ error: 'This deal can no longer be cancelled.' });
  const updated = await prisma.agentDeal.update({ where: { id: deal.id }, data: { status: 'CANCELLED' }, include: { property: true } });
  res.json(toDealDto(updated));
});

// ---- Landlord side: confirm / dispute ------------------------------------

async function confirmDeal(dealId: string) {
  const deal = await prisma.agentDeal.findUniqueOrThrow({ where: { id: dealId }, include: { agent: true, property: true } });
  const payment = await initializeSplitPayment({
    email: deal.tenantEmail,
    amount: deal.agentFee,
    platformAmount: deal.platformAmount,
    reference: `ECAG_${deal.id}_${Date.now().toString(36)}`,
    subaccountCode: deal.agent.paystackSubaccountCode,
    callbackUrl: `${env.marketplace.listingsUrl}/?paid=agent-fee`,
    metadata: { kind: 'agent_fee', dealId: deal.id, propertyId: deal.propertyId },
  });
  const updated = await prisma.agentDeal.update({
    where: { id: deal.id },
    data: { status: 'AWAITING_PAYMENT', landlordRespondedAt: new Date(), paymentRef: payment.reference, paymentLink: payment.paymentLink, payoutMethod: payment.payoutMethod },
    include: { property: true, agent: true },
  });
  void sendEmail(
    deal.tenantEmail,
    `Agent fee for ${deal.property.title}`,
    `Hi ${deal.tenantName.split(' ')[0]},\n\nYour landlord has confirmed your new home at ${deal.property.title}. ` +
      `The agent fee to ${deal.agent.name}${deal.agent.agencyName ? ` (${deal.agent.agencyName})` : ''} is ${naira(deal.agentFee)}.\n\n` +
      `Pay securely through EstateCopilot (Paystack — card, bank transfer or USSD):\n${payment.paymentLink}\n\nEstateCopilot`,
  );
  await alertAgent(
    deal.agentId,
    { kind: 'DEAL_UPDATE', title: 'Landlord confirmed your deal', body: `${deal.property.title}: the tenant has been sent a link to pay the ${naira(deal.agentFee)} fee. Payment link: ${payment.paymentLink}`, propertyId: deal.propertyId },
    { to: deal.agent.email, text: `Good news — the landlord confirmed your deal for ${deal.property.title}.\n\nThe tenant (${deal.tenantName}) has been emailed a link to pay the ${naira(deal.agentFee)} agent fee. You can also send it to them directly:\n${payment.paymentLink}\n\nWhen they pay, ${naira(deal.agentAmount)} goes to your bank automatically.\n\nEstateCopilot` },
  );
  return updated;
}

async function disputeDeal(dealId: string, reason: string) {
  const deal = await prisma.agentDeal.update({
    where: { id: dealId },
    data: { status: 'DISPUTED', disputeReason: reason, landlordRespondedAt: new Date() },
    include: { agent: true, property: true },
  });
  await alertAgent(
    deal.agentId,
    { kind: 'DEAL_UPDATE', title: 'Landlord disputed your deal', body: `${deal.property.title}: “${reason}”. Our team will be in touch.`, propertyId: deal.propertyId },
    { to: deal.agent.email, text: `The landlord disputed your deal for ${deal.property.title}:\n\n“${reason}”\n\nOur team will contact you both to sort it out.\n\nEstateCopilot` },
  );
  void notifyOps('Agent deal DISPUTED', `${deal.agent.name} → ${deal.property.title}. Reason: ${reason}`);
  return deal;
}

function landlordDealView(d: any) {
  return {
    id: d.id,
    status: d.status,
    property: { title: d.property.title, address: d.property.address, lga: d.property.lga, state: d.property.state },
    agent: { name: d.agent.name, agencyName: d.agent.agencyName, phone: d.agent.phone },
    tenantName: d.tenantName,
    tenantPhone: d.tenantPhone,
    tenantEmail: d.tenantEmail,
    annualRent: d.annualRent,
    agentFee: d.agentFee,
    createdAt: d.createdAt,
  };
}

// One-click confirm from the landlord's email — the token is the credential.
agentsRouter.get('/public/agent-deals/:token', async (req, res) => {
  if (env.mockMode) return noMock(res);
  const deal = await prisma.agentDeal.findUnique({ where: { landlordToken: req.params.token }, include: { agent: true, property: true } });
  if (!deal) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  res.json(landlordDealView(deal));
});

agentsRouter.post('/public/agent-deals/:token/confirm', async (req, res) => {
  if (env.mockMode) return noMock(res);
  const deal = await prisma.agentDeal.findUnique({ where: { landlordToken: req.params.token } });
  if (!deal) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  if (deal.status !== 'PENDING_LANDLORD') return res.status(409).json({ error: 'This deal has already been answered.' });
  const updated = await confirmDeal(deal.id);
  res.json(landlordDealView(updated));
});

const disputeSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

agentsRouter.post('/public/agent-deals/:token/dispute', async (req, res) => {
  if (env.mockMode) return noMock(res);
  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Tell us briefly what’s wrong' });
  const deal = await prisma.agentDeal.findUnique({ where: { landlordToken: req.params.token } });
  if (!deal) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  if (deal.status !== 'PENDING_LANDLORD') return res.status(409).json({ error: 'This deal has already been answered.' });
  const updated = await disputeDeal(deal.id, parsed.data.reason);
  res.json(landlordDealView(updated));
});

// Same actions from inside the landlord portal / app.
agentsRouter.get('/landlord/agent-deals', requireLandlordAuth, async (req: LandlordAuthedRequest, res) => {
  if (env.mockMode) return res.json([]);
  const deals = await prisma.agentDeal.findMany({
    where: { property: { landlordId: req.landlord!.landlordId } },
    include: { agent: true, property: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(deals.map(landlordDealView));
});

agentsRouter.post('/landlord/agent-deals/:id/confirm', requireLandlordAuth, async (req: LandlordAuthedRequest, res) => {
  if (env.mockMode) return noMock(res);
  const deal = await prisma.agentDeal.findFirst({ where: { id: req.params.id, property: { landlordId: req.landlord!.landlordId } } });
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.status !== 'PENDING_LANDLORD') return res.status(409).json({ error: 'This deal has already been answered.' });
  res.json(landlordDealView(await confirmDeal(deal.id)));
});

agentsRouter.post('/landlord/agent-deals/:id/dispute', requireLandlordAuth, async (req: LandlordAuthedRequest, res) => {
  if (env.mockMode) return noMock(res);
  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Tell us briefly what’s wrong' });
  const deal = await prisma.agentDeal.findFirst({ where: { id: req.params.id, property: { landlordId: req.landlord!.landlordId } } });
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.status !== 'PENDING_LANDLORD') return res.status(409).json({ error: 'This deal has already been answered.' });
  res.json(landlordDealView(await disputeDeal(deal.id, parsed.data.reason)));
});
