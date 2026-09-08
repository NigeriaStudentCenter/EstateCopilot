import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Artisans sign in with a phone number + one-time code, never a password —
// most are onboarding from a WhatsApp link on a cheap Android phone.

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

// ---- OTP store (in-memory, single-use, short-lived) ----
const MOCK_OTP = '000000';
const OTP_TTL_MS = 10 * 60 * 1000;
const store = new Map<string, { code: string; expires: number }>();

export function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export function issueOtp(phone: string): { devOtp?: string } {
  if (env.artisanAuth.otpProvider) {
    // A real SMS provider would go here. Until then this branch is unreachable
    // because otpProvider is unset in every current environment.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    store.set(phone, { code, expires: Date.now() + OTP_TTL_MS });
    return {};
  }
  store.set(phone, { code: MOCK_OTP, expires: Date.now() + OTP_TTL_MS });
  console.log(`[artisan] OTP for ${phone}: ${MOCK_OTP}`);
  return { devOtp: MOCK_OTP };
}

export function checkOtp(phone: string, code: string): boolean {
  const hit = store.get(phone);
  if (!hit || hit.expires < Date.now() || hit.code !== code) return false;
  store.delete(phone);
  return true;
}
