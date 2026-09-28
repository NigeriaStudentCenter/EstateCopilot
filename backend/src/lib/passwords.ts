import crypto from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  // A malformed stored hash must fail the login, not throw — timingSafeEqual
  // throws on a length mismatch, and that used to crash the whole API.
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}
