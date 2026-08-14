import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export { hashPassword, verifyPassword } from '../lib/passwords.js';

export interface LandlordTokenPayload {
  landlordId: string;
  name: string;
  email: string;
}

export function signLandlordToken(payload: LandlordTokenPayload): string {
  return jwt.sign(payload, env.landlordAuth.jwtSecret, { expiresIn: '30d' });
}

export function verifyLandlordToken(token: string): LandlordTokenPayload {
  return jwt.verify(token, env.landlordAuth.jwtSecret) as LandlordTokenPayload;
}
