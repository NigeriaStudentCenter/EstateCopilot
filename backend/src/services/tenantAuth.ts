import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export { hashPassword, verifyPassword } from '../lib/passwords.js';

export interface TenantTokenPayload {
  tenantId: string;
  tenancyId: string;
  name: string;
  email: string;
}

export function signTenantToken(payload: TenantTokenPayload): string {
  return jwt.sign(payload, env.tenantAuth.jwtSecret, { expiresIn: '30d' });
}

export function verifyTenantToken(token: string): TenantTokenPayload {
  return jwt.verify(token, env.tenantAuth.jwtSecret) as TenantTokenPayload;
}
