import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MOCK_TENANCIES, mockTenantAccounts } from '../lib/mockTenancies.js';
import { hashPassword, verifyPassword, signTenantToken, verifyTenantToken, type TenantTokenPayload } from '../services/tenantAuth.js';

export const tenantAuthRouter = Router();

const signupSchema = z.object({
  tenancyId: z.string().min(1), // the invite code a landlord/agent hands the tenant at move-in
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

tenantAuthRouter.post('/tenant-auth/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { tenancyId, name, email, password } = parsed.data;

  if (env.mockMode) {
    const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
    if (!tenancy) {
      return res.status(404).json({ error: 'That tenancy ID was not recognized. Check the invite code your landlord sent.' });
    }
    if (mockTenantAccounts.has(email)) {
      return res.status(409).json({ error: 'An account already exists for this email.' });
    }
    mockTenantAccounts.set(email, { email, passwordHash: hashPassword(password), name, tenancyId });
    const token = signTenantToken({ tenantId: tenancyId, tenancyId, name, email });
    return res.status(201).json({ token, tenancy: { id: tenancy.id, propertyTitle: tenancy.propertyTitle } });
  }

  const tenant = await prisma.tenant.findFirst({ where: { tenancies: { some: { id: tenancyId } } } });
  if (!tenant) {
    return res.status(404).json({ error: 'That tenancy ID was not recognized.' });
  }
  if (tenant.email) {
    return res.status(409).json({ error: 'An account already exists for this tenant.' });
  }
  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { email, passwordHash: hashPassword(password), name },
  });
  const token = signTenantToken({ tenantId: updated.id, tenancyId, name: updated.name, email });
  res.status(201).json({ token });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

tenantAuthRouter.post('/tenant-auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  if (env.mockMode) {
    const account = mockTenantAccounts.get(email);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signTenantToken({ tenantId: account.tenancyId, tenancyId: account.tenancyId, name: account.name, email });
    return res.json({ token });
  }

  const tenant = await prisma.tenant.findUnique({ where: { email }, include: { tenancies: true } });
  if (!tenant?.passwordHash || !verifyPassword(password, tenant.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const tenancyId = tenant.tenancies[0]?.id;
  const token = signTenantToken({ tenantId: tenant.id, tenancyId, name: tenant.name, email });
  res.json({ token });
});

export interface AuthedRequest extends Request {
  tenant?: TenantTokenPayload;
}

export function requireTenantAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    req.tenant = verifyTenantToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
