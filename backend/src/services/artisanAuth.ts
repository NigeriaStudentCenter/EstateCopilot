import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

// Artisans sign in with a phone number + one-time code, never a password —
// most are onboarding from a WhatsApp link on a cheap Android phone, and can
// register themselves with no invite or admin step (see routes/artisan.ts).

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
// code" — an in-memory Map didn't, and was silently breaking artisan
// self-registration with "Invalid or expired code" any time the API
// redeployed mid-signup. Mock mode keeps the in-memory Map (no DB needed).
const MOCK_OTP = '000000';
const OTP_TTL_MS = 10 * 60 * 1000;
const mockStore = new Map<string, { code: string; expires: number }>();

export function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export async function issueOtp(phone: string): Promise<{ devOtp?: string }> {
  // A real SMS provider would go here (env.artisanAuth.otpProvider); it's
  // unset in every current environment, so the code is always shown back to
  // the caller (devOtp) instead of being sent out of band.
  const code = env.artisanAuth.otpProvider ? String(Math.floor(100000 + Math.random() * 900000)) : MOCK_OTP;
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  if (env.mockMode) {
    mockStore.set(phone, { code, expires: expiresAt.getTime() });
  } else {
    await prisma.artisanOtp.upsert({
      where: { phone },
      create: { phone, code, expiresAt },
      update: { code, expiresAt },
    });
  }

  if (!env.artisanAuth.otpProvider) {
    console.log(`[artisan] OTP for ${phone}: ${code}`);
    return { devOtp: code };
  }
  return {};
}

// Checks validity WITHOUT consuming the code — a brand-new artisan verifies
// the code once, then (on the 422 "needsProfile" response) resubmits the
// *same* code together with their name/state/LGA to actually create the
// account. Deleting the code on the first check made that second, real
// registration call fail with "Invalid or expired code" every time — the
// account was never created because the code that gated it no longer
// existed by the time the profile fields arrived. Callers must call
// consumeOtp() once the phone is fully resolved to an account (existing or
// newly created).
export async function checkOtp(phone: string, code: string): Promise<boolean> {
  if (env.mockMode) {
    const hit = mockStore.get(phone);
    return !!hit && hit.expires >= Date.now() && hit.code === code;
  }

  const hit = await prisma.artisanOtp.findUnique({ where: { phone } });
  return !!hit && hit.expiresAt.getTime() >= Date.now() && hit.code === code;
}

export async function consumeOtp(phone: string): Promise<void> {
  if (env.mockMode) {
    mockStore.delete(phone);
    return;
  }
  await prisma.artisanOtp.delete({ where: { phone } }).catch(() => {}); // already gone / racing another consume — fine either way
}
