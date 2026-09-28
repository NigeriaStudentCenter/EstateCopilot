import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { verifyLandlordToken } from '../services/landlordAuth.js';
import { verifyTenantToken } from '../services/tenantAuth.js';
import { verifyArtisanToken } from '../services/artisanAuth.js';
import { mockLandlords, mockLandlordsByEmail } from '../lib/mockLandlords.js';
import { mockTenantAccounts } from '../lib/mockTenancies.js';
import { mockArtisans, mockArtisansByPhone } from '../lib/mockArtisans.js';
import { notifyOps } from '../lib/notifyOps.js';
import { forgetDevicesFor, registerDevice, type PushRole } from '../services/push.js';

// Mobile app account endpoints: in-app account deletion (App Store 5.1.1(v))
// and push-notification device registration. Deletion only checks that the
// caller is signed in — not their subscription — so a lapsed landlord can
// still delete their account.
//
// What deleting keeps: tenancy, payment and repair records a landlord or the
// law needs stay in place but are anonymised (no name, email, phone, ID
// numbers or bank details). Artisan profiles are deleted outright.
export const accountRouter = Router();

function bearer(req: Request): string | undefined {
  const h = req.get('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}

/** Works out who is calling from any of the three token types. */
function whoIs(req: Request): { role: PushRole; accountId: string } | null {
  const token = bearer(req);
  if (!token) return null;
  // The token types may share a signing secret, so decide the role from the
  // payload's id field, not from which verifier accepts the signature.
  const attempts: Array<[PushRole, () => Record<string, unknown>, string]> = [
    ['artisan', () => verifyArtisanToken(token) as unknown as Record<string, unknown>, 'artisanId'],
    ['tenant', () => verifyTenantToken(token) as unknown as Record<string, unknown>, 'tenantId'],
    ['landlord', () => verifyLandlordToken(token) as unknown as Record<string, unknown>, 'landlordId'],
  ];
  for (const [role, verify, field] of attempts) {
    try {
      const id = verify()[field];
      if (typeof id === 'string' && id) return { role, accountId: id };
    } catch {
      /* not this token type */
    }
  }
  return null;
}

const deletedTag = (id: string) => `deleted-${id}`;

async function deleteLandlord(id: string): Promise<void> {
  if (env.mockMode) {
    const l = mockLandlords.get(id);
    if (!l) return;
    mockLandlordsByEmail.delete(l.email);
    mockLandlords.delete(id);
    return;
  }
  const before = await prisma.landlord.findUnique({ where: { id } });
  if (!before) return;
  await prisma.$transaction([
    prisma.property.updateMany({ where: { landlordId: id }, data: { isAdvertised: false } }),
    prisma.landlord.update({
      where: { id },
      data: {
        name: 'Deleted landlord',
        email: `${deletedTag(id)}@deleted.invalid`,
        phone: deletedTag(id),
        passwordHash: null,
        referralCode: null,
        subscriptionStatus: 'CANCELLED',
        bankAccountNumber: null,
        bankCode: null,
        bankAccountName: null,
      },
    }),
  ]);
  // A recurring Paystack subscription is cancelled by the operator.
  if (before.paystackSubscriptionCode || before.subscriptionStatus === 'ACTIVE') {
    await notifyOps(
      'Landlord deleted their account — cancel any Paystack subscription',
      `Landlord ${id} (was ${before.email}) deleted their account in the app. Paystack subscription: ${before.paystackSubscriptionCode ?? 'none recorded'}. Please make sure no further charges are taken.`,
    ).catch(() => undefined);
  }
}

async function deleteTenant(id: string): Promise<void> {
  if (env.mockMode) {
    for (const [email, acc] of mockTenantAccounts) if (acc.tenancyId === id) mockTenantAccounts.delete(email);
    return;
  }
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return;
  await prisma.$transaction([
    prisma.guarantor.deleteMany({ where: { tenantId: id } }),
    prisma.tenant.update({
      where: { id },
      data: { name: 'Deleted tenant', email: null, phone: deletedTag(id), passwordHash: null, nin: null, bvn: null },
    }),
  ]);
}

async function deleteArtisan(id: string): Promise<void> {
  if (env.mockMode) {
    const a = mockArtisans.get(id);
    if (!a) return;
    mockArtisansByPhone.delete(a.phone);
    mockArtisans.delete(id);
    return;
  }
  const artisan = await prisma.artisan.findUnique({ where: { id } });
  if (!artisan) return;
  await prisma.$transaction([
    // Quotes stay on the landlord's jobs, without the artisan's details.
    prisma.repairQuote.updateMany({
      where: { artisanId: id },
      data: { artisanId: null, handymanName: 'Deleted artisan', handymanPhone: '', handymanEmail: null },
    }),
    prisma.artisanOtp.deleteMany({ where: { phone: artisan.phone } }),
    prisma.artisan.delete({ where: { id } }), // trades, credentials, samples, leads cascade
  ]);
}

// DELETE /api/account — deletes the signed-in account (landlord, tenant or artisan).
accountRouter.delete('/account', async (req: Request, res: Response) => {
  const who = whoIs(req);
  if (!who) return res.status(401).json({ error: 'Sign in required' });
  try {
    if (who.role === 'landlord') await deleteLandlord(who.accountId);
    else if (who.role === 'tenant') await deleteTenant(who.accountId);
    else await deleteArtisan(who.accountId);
    await forgetDevicesFor(who.role, who.accountId);
  } catch (err) {
    console.error('[account] delete failed:', err);
    return res.status(500).json({ error: 'We could not delete your account just now. Please try again.' });
  }
  res.json({ deleted: true, role: who.role });
});

const deviceSchema = z.object({
  token: z.string().regex(/^[0-9a-fA-F]{32,200}$/),
  platform: z.enum(['ios', 'android']),
});

// POST /api/devices — registers this phone for push notifications.
accountRouter.post('/devices', async (req: Request, res: Response) => {
  const who = whoIs(req);
  if (!who) return res.status(401).json({ error: 'Sign in required' });
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid device token' });
  await registerDevice(parsed.data.token, parsed.data.platform, who.role, who.accountId);
  res.json({ registered: true });
});
