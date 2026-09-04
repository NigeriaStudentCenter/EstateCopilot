import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { mockLandlords, mockLandlordsByEmail, createMockLandlord, findMockLandlordByReference } from '../lib/mockLandlords.js';
import { stateBySlug } from '../lib/nigeriaStates.js';
import { hashPassword, verifyPassword, signLandlordToken, verifyLandlordToken, type LandlordTokenPayload } from '../services/landlordAuth.js';
import { initializeSubscription, verifySubscriptionTransaction } from '../services/paystackSubscription.js';
import { resolveBankAccount, createLandlordSubaccount } from '../services/paystackSubaccount.js';
import { pushSubscribedLandlord } from '../services/sharepoint.js';

export const landlordAuthRouter = Router();

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  password: z.string().min(8),
  // Client sends a state slug (same convention as every other state-filtered
  // endpoint) — resolved here to the canonical display name that gets stored.
  state: z.string().transform((slug, ctx) => {
    const resolved = stateBySlug(slug);
    if (!resolved) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a valid Nigeria state' });
      return z.NEVER;
    }
    return resolved.name;
  }),
});

// Step 1: create the account (unpaid) and start a ₦10,000/month Paystack
// subscription transaction. In mock mode there's no real checkout — the
// signup page shows an inline "confirm mock payment" step instead.
landlordAuthRouter.post('/landlord-auth/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, phone, password, state } = parsed.data;

  const existing = env.mockMode
    ? mockLandlordsByEmail.has(email)
    : await prisma.landlord.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account already exists for this email.' });
  }

  if (env.mockMode) {
    const landlord = createMockLandlord({ name, email, phone, state, passwordHash: hashPassword(password) });
    const { reference, authorizationUrl } = await initializeSubscription({ email, name });
    landlord.pendingReference = reference;
    return res.status(201).json({
      landlordId: landlord.id,
      reference,
      authorizationUrl,
      hostedPageUrl: env.subscription.hostedPageUrl,
      monthlyAmountKobo: env.subscription.monthlyAmountKobo,
    });
  }

  const landlord = await prisma.landlord.create({
    data: { name, email, phone, state, passwordHash: hashPassword(password) },
  });
  // landlordId is embedded in the callback URL (not just the Paystack
  // reference) so /signup/callback can confirm without a lookup table.
  const { reference, authorizationUrl } = await initializeSubscription({
    email,
    name,
    callbackUrl: `${env.subscription.signupCallbackUrl}?landlordId=${landlord.id}`,
  });
  res.status(201).json({
    landlordId: landlord.id,
    reference,
    authorizationUrl,
    hostedPageUrl: env.subscription.hostedPageUrl,
    monthlyAmountKobo: env.subscription.monthlyAmountKobo,
  });
});

// --- Operator activation (pilot billing) -----------------------------
// Landlords pay ₦10,000/month on the Paystack-hosted page, then an operator
// flips their account to ACTIVE here. Guarded by a shared ADMIN_API_KEY —
// if that env var is unset, these endpoints 404 (feature off).
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!env.admin.apiKey) return res.sendStatus(404);
  if (req.get('x-admin-key') !== env.admin.apiKey) return res.status(401).json({ error: 'Bad admin key' });
  next();
}

landlordAuthRouter.get('/landlord-auth/admin/pending', requireAdmin, async (_req, res) => {
  if (env.mockMode) {
    const pending = [...mockLandlords.values()]
      .filter((l) => l.subscriptionStatus !== 'ACTIVE')
      .map((l) => ({ id: l.id, name: l.name, email: l.email, phone: l.phone, state: l.state, subscriptionStatus: l.subscriptionStatus }));
    return res.json(pending);
  }
  const pending = await prisma.landlord.findMany({
    where: { subscriptionStatus: { not: 'ACTIVE' } },
    select: { id: true, name: true, email: true, phone: true, state: true, subscriptionStatus: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(pending);
});

const activateSchema = z.object({ email: z.string().email() });

landlordAuthRouter.post('/landlord-auth/admin/activate', requireAdmin, async (req, res) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email } = parsed.data; // matched exactly, same as signup/login store the address

  if (env.mockMode) {
    const id = mockLandlordsByEmail.get(email);
    const landlord = id ? mockLandlords.get(id) : undefined;
    if (!landlord) return res.status(404).json({ error: 'No landlord with that email' });
    landlord.subscriptionStatus = 'ACTIVE';
    landlord.currentPeriodEnd = new Date(Date.now() + 30 * 864e5).toISOString();
    landlord.pendingReference = undefined;
    void pushSubscribedLandlord({
      landlordName: landlord.name,
      email: landlord.email,
      phone: landlord.phone,
      state: landlord.state,
      subscriptionStatus: landlord.subscriptionStatus,
      monthlyAmountNaira: env.subscription.monthlyAmountKobo / 100,
      bankAccountName: landlord.bankAccountName,
      paystackConnected: !!landlord.paystackSubaccountCode,
    });
    return res.json({ id: landlord.id, email: landlord.email, subscriptionStatus: landlord.subscriptionStatus });
  }

  const landlord = await prisma.landlord.findUnique({ where: { email } });
  if (!landlord) return res.status(404).json({ error: 'No landlord with that email' });
  const updated = await prisma.landlord.update({
    where: { email },
    data: { subscriptionStatus: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 864e5) },
  });
  void pushSubscribedLandlord({
    landlordName: updated.name,
    email: updated.email,
    phone: updated.phone ?? undefined,
    state: updated.state,
    subscriptionStatus: updated.subscriptionStatus,
    monthlyAmountNaira: env.subscription.monthlyAmountKobo / 100,
    bankAccountName: updated.bankAccountName ?? undefined,
    paystackConnected: !!updated.paystackSubaccountCode,
  });
  res.json({ id: updated.id, email: updated.email, subscriptionStatus: updated.subscriptionStatus });
});

const confirmSchema = z.object({ reference: z.string().min(1), landlordId: z.string().optional() });

// Step 2: called either by the mock-pay button (mock mode) or the
// /signup/callback page after a real Paystack redirect. Verifying with
// Paystack (not trusting the client) is what actually activates the account.
landlordAuthRouter.post('/landlord-auth/confirm', async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reference } = parsed.data;

  const verification = await verifySubscriptionTransaction(reference);
  if (!verification.success) {
    return res.status(402).json({ error: 'Payment could not be verified.' });
  }

  if (env.mockMode) {
    const landlord = findMockLandlordByReference(reference);
    if (!landlord) return res.status(404).json({ error: 'Signup not found for this reference.' });
    landlord.subscriptionStatus = 'ACTIVE';
    landlord.paystackCustomerCode = verification.customerCode;
    landlord.paystackSubscriptionCode = verification.subscriptionCode;
    landlord.currentPeriodEnd = verification.currentPeriodEnd?.toISOString();
    landlord.pendingReference = undefined;
    const token = signLandlordToken({ landlordId: landlord.id, name: landlord.name, email: landlord.email });
    void pushSubscribedLandlord({
      landlordName: landlord.name,
      email: landlord.email,
      phone: landlord.phone,
      state: landlord.state,
      subscriptionStatus: landlord.subscriptionStatus,
      monthlyAmountNaira: env.subscription.monthlyAmountKobo / 100,
      bankAccountName: landlord.bankAccountName,
      paystackConnected: !!landlord.paystackSubaccountCode,
    });
    return res.json({ token });
  }

  if (!parsed.data.landlordId) {
    return res.status(400).json({ error: 'landlordId is required to confirm in live mode.' });
  }
  const landlord = await prisma.landlord.update({
    where: { id: parsed.data.landlordId },
    data: {
      subscriptionStatus: 'ACTIVE',
      paystackCustomerCode: verification.customerCode,
      paystackSubscriptionCode: verification.subscriptionCode,
      currentPeriodEnd: verification.currentPeriodEnd,
    },
  });
  const token = signLandlordToken({ landlordId: landlord.id, name: landlord.name, email: landlord.email });
  void pushSubscribedLandlord({
    landlordName: landlord.name,
    email: landlord.email,
    phone: landlord.phone ?? undefined,
    state: landlord.state,
    subscriptionStatus: landlord.subscriptionStatus,
    monthlyAmountNaira: env.subscription.monthlyAmountKobo / 100,
    bankAccountName: landlord.bankAccountName ?? undefined,
    paystackConnected: !!landlord.paystackSubaccountCode,
  });
  res.json({ token });
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

landlordAuthRouter.post('/landlord-auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  if (env.mockMode) {
    const id = mockLandlordsByEmail.get(email);
    const landlord = id ? mockLandlords.get(id) : undefined;
    if (!landlord || !verifyPassword(password, landlord.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signLandlordToken({ landlordId: landlord.id, name: landlord.name, email: landlord.email });
    return res.json({ token, subscriptionStatus: landlord.subscriptionStatus });
  }

  const landlord = await prisma.landlord.findUnique({ where: { email } });
  if (!landlord?.passwordHash || !verifyPassword(password, landlord.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = signLandlordToken({ landlordId: landlord.id, name: landlord.name, email: landlord.email });
  res.json({ token, subscriptionStatus: landlord.subscriptionStatus });
});

export interface LandlordAuthedRequest extends Request {
  landlord?: LandlordTokenPayload & { subscriptionStatus: string };
}

// Verifies the token AND re-checks current subscription status on every
// request (not just at login) — a PAST_DUE/CANCELLED landlord loses portal
// access immediately, without needing to wait for their token to expire.
export async function requireLandlordAuth(req: LandlordAuthedRequest, res: Response, next: NextFunction) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  let payload: LandlordTokenPayload;
  try {
    payload = verifyLandlordToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const status = env.mockMode
    ? mockLandlords.get(payload.landlordId)?.subscriptionStatus
    : (await prisma.landlord.findUnique({ where: { id: payload.landlordId } }))?.subscriptionStatus;

  if (!status) return res.status(401).json({ error: 'Account not found' });
  if (status !== 'ACTIVE') {
    return res.status(402).json({ error: `Subscription is ${status.toLowerCase().replace('_', ' ')} — reactivate to continue.`, subscriptionStatus: status });
  }

  req.landlord = { ...payload, subscriptionStatus: status };
  next();
}

landlordAuthRouter.get('/landlord/me', requireLandlordAuth, async (req: LandlordAuthedRequest, res) => {
  if (env.mockMode) {
    const landlord = mockLandlords.get(req.landlord!.landlordId);
    return res.json({
      id: landlord!.id,
      name: landlord!.name,
      email: landlord!.email,
      phone: landlord!.phone,
      state: landlord!.state,
      subscriptionStatus: landlord!.subscriptionStatus,
      currentPeriodEnd: landlord!.currentPeriodEnd,
      monthlyAmountKobo: env.subscription.monthlyAmountKobo,
      bankAccountNumber: landlord!.bankAccountNumber,
      bankAccountName: landlord!.bankAccountName,
      paystackConnected: !!landlord!.paystackSubaccountCode,
    });
  }
  const landlord = await prisma.landlord.findUnique({ where: { id: req.landlord!.landlordId } });
  res.json({ ...landlord, monthlyAmountKobo: env.subscription.monthlyAmountKobo, paystackConnected: !!landlord?.paystackSubaccountCode });
});

const bankDetailsSchema = z.object({
  bankAccountNumber: z.string().min(10).max(10),
  bankCode: z.string().min(3),
  bankName: z.string().min(2), // display label for the bank the code refers to, e.g. "GTBank"
});

// Connects the landlord's own bank account as a Paystack Subaccount — this
// is what makes rent land directly with them instead of passing through the
// platform. Their account number is verified against Paystack's own
// name-match check before we save anything.
landlordAuthRouter.post('/landlord/bank-details', requireLandlordAuth, async (req: LandlordAuthedRequest, res) => {
  const parsed = bankDetailsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { bankAccountNumber, bankCode, bankName } = parsed.data;

  let resolved;
  try {
    resolved = await resolveBankAccount(bankAccountNumber, bankCode);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Could not verify that account' });
  }

  if (env.mockMode) {
    const landlord = mockLandlords.get(req.landlord!.landlordId)!;
    const subaccount = await createLandlordSubaccount({
      businessName: `${landlord.name} — ${bankName}`,
      bankCode,
      accountNumber: bankAccountNumber,
    });
    landlord.bankAccountNumber = bankAccountNumber;
    landlord.bankCode = bankCode;
    landlord.bankAccountName = resolved.accountName;
    landlord.paystackSubaccountCode = subaccount.subaccountCode;
    return res.json({
      bankAccountNumber,
      bankAccountName: resolved.accountName,
      paystackConnected: true,
    });
  }

  const landlord = await prisma.landlord.findUnique({ where: { id: req.landlord!.landlordId } });
  const subaccount = await createLandlordSubaccount({
    businessName: `${landlord!.name} — ${bankName}`,
    bankCode,
    accountNumber: bankAccountNumber,
  });
  await prisma.landlord.update({
    where: { id: req.landlord!.landlordId },
    data: {
      bankAccountNumber,
      bankCode,
      bankAccountName: resolved.accountName,
      paystackSubaccountCode: subaccount.subaccountCode,
    },
  });
  res.json({ bankAccountNumber, bankAccountName: resolved.accountName, paystackConnected: true });
});
