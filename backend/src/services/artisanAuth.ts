import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { sendWhatsAppAuthCode } from './whatsapp.js';

// Artisans sign in with a phone number + one-time code, never a password —
// most are onboarding from a WhatsApp link on a cheap Android phone, and can
// register themselves with no invite or admin step (see routes/artisan.ts).
// The code is random, sent by WhatsApp, valid 10 minutes, burned after 5 wrong
// guesses, and a new one can be requested at most once a minute.

export interface ArtisanTokenPayload {
  artisanId: string;
  phone: string;
}

export function signArtisanToken(payload: ArtisanTokenPayload): string {
  return jwt.sign(payload, env.artisanAuth.jwtSecret, { expiresIn: '60d' });
}

export function verifyArtisanToken(token: string): ArtisanTokenPayload {
  return jwt.verify(token, env.artisanAuth.jwtSecret) as ArtisanTokenPayload;
}

// ---- OTP store ----
// Real mode persists to Postgres (ArtisanOtp) so a code survives an app
// restart, a redeploy, or a second instance between "send code" and "verify
// code". Mock mode keeps an in-memory Map and the fixed code 000000.
const MOCK_OTP = '000000';
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const mockStore = new Map<string, { code: string; expires: number }>();

export function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/** WhatsApp needs the international form: a local Nigerian 0803… becomes 234803…. */
const toWhatsApp = (phone: string) => (phone.startsWith('0') && phone.length === 11 ? `234${phone.slice(1)}` : phone);

const testCodeFor = (phone: string) => env.artisanAuth.testLogins.find(([p]) => p === phone)?.[1];

export type IssueResult =
  | { ok: true; devOtp?: string }
  | { ok: false; status: number; error: string };

export async function issueOtp(phone: string): Promise<IssueResult> {
  if (env.mockMode) {
    mockStore.set(phone, { code: MOCK_OTP, expires: Date.now() + OTP_TTL_MS });
    console.log(`[artisan] OTP for ${phone}: ${MOCK_OTP}`);
    return { ok: true, devOtp: MOCK_OTP };
  }

  const test = testCodeFor(phone);
  if (test) {
    await prisma.artisanOtp.upsert({
      where: { phone },
      create: { phone, code: test, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      update: { code: test, expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, createdAt: new Date() },
    });
    return { ok: true };
  }

  const existing = await prisma.artisanOtp.findUnique({ where: { phone } });
  if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { ok: false, status: 429, error: 'We just sent you a code — wait a minute before asking for another.' };
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.artisanOtp.upsert({
    where: { phone },
    create: { phone, code, expiresAt },
    update: { code, expiresAt, attempts: 0, createdAt: new Date() },
  });
  const sent = await sendWhatsAppAuthCode(toWhatsApp(phone), code);
  if (!sent.sent) {
    await prisma.artisanOtp.delete({ where: { phone } }).catch(() => {});
    return { ok: false, status: 502, error: "We couldn't send your code on WhatsApp. Check the number has WhatsApp and try again." };
  }
  return { ok: true };
}

// Checks validity WITHOUT consuming the code — a brand-new artisan verifies
// the code once, then (on the 422 "needsProfile" response) resubmits the
// *same* code together with their name/state/LGA to actually create the
// account. Callers must call consumeOtp() once the phone is fully resolved to
// an account. A wrong guess counts toward the 5-attempt limit.
export async function checkOtp(phone: string, code: string): Promise<boolean> {
  if (env.mockMode) {
    const hit = mockStore.get(phone);
    return !!hit && hit.expires >= Date.now() && hit.code === code;
  }

  const hit = await prisma.artisanOtp.findUnique({ where: { phone } });
  if (!hit || hit.expiresAt.getTime() < Date.now() || hit.attempts >= MAX_ATTEMPTS) return false;
  const match = hit.code.length === code.length && crypto.timingSafeEqual(Buffer.from(hit.code), Buffer.from(code));
  if (!match) {
    await prisma.artisanOtp.update({ where: { phone }, data: { attempts: { increment: 1 } } }).catch(() => {});
  }
  return match;
}

export async function consumeOtp(phone: string): Promise<void> {
  if (env.mockMode) {
    mockStore.delete(phone);
    return;
  }
  await prisma.artisanOtp.delete({ where: { phone } }).catch(() => {}); // already gone / racing another consume — fine either way
}
