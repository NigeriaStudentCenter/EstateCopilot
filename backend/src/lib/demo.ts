import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { verifyLandlordToken } from '../services/landlordAuth.js';

// The shared demo landlord (App Store review, TestFlight testers, prospective
// landlords trying the app) — see env.demo.

export function isDemoEmail(email: string | undefined | null): boolean {
  return !!email && env.demo.emails.includes(email.trim().toLowerCase());
}

// Demo landlord ids, cached — asked on every public listing request.
let cache: { ids: string[]; at: number } | null = null;

export async function demoLandlordIds(): Promise<string[]> {
  if (env.mockMode || !env.demo.emails.length) return [];
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.ids;
  const rows = await prisma.landlord.findMany({
    where: { email: { in: env.demo.emails, mode: 'insensitive' } },
    select: { id: true },
  });
  cache = { ids: rows.map((r) => r.id), at: Date.now() };
  return cache.ids;
}

/** Prisma filter that keeps the demo landlord's (fictional) properties off the public marketplace. */
export async function notDemoProperty(): Promise<{ landlordId?: { notIn: string[] } }> {
  const ids = await demoLandlordIds();
  return ids.length ? { landlordId: { notIn: ids } } : {};
}

// Actions blocked on the demo account: anything that costs money, contacts
// real people outside the demo, or can't be undone by the nightly reset.
// Account deletion is deliberately NOT blocked: App Store review tests it with
// this login, so it really deletes — and the nightly reset restores the demo.
const BLOCKED: Array<[string, RegExp]> = [
  ['POST', /^\/api\/landlord\/bank-details\/?$/],
  ['POST', /^\/api\/payments\/virtual-account\/?$/],
  ['POST', /^\/api\/tenancies\/invite\/?$/],
  ['POST', /^\/api\/tenancies\/[^/]+\/verify-bvn\/?$/],
  ['POST', /^\/api\/tenancies\/[^/]+\/payment-plan\/?$/],
  ['POST', /^\/api\/vetting\//],
  ['DELETE', /^\/api\/properties\/[^/]+\/images\/?$/], // restoring the snapshot can't bring a deleted photo back
];

export function demoGuard(req: Request, res: Response, next: NextFunction) {
  if (!BLOCKED.some(([m, re]) => m === req.method && re.test(req.path))) return next();
  const h = req.get('authorization');
  const token = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  if (!token) return next();
  try {
    const payload = verifyLandlordToken(token) as { email?: string; landlordId?: string };
    if (payload.landlordId && isDemoEmail(payload.email)) {
      return res.status(403).json({
        error: "This is a shared demo account, so this action is turned off. Everything else works as normal — create your own account at estatecopilot.org to use it for real.",
        demo: true,
      });
    }
  } catch {
    /* not a landlord token — let the route's own auth handle it */
  }
  next();
}
