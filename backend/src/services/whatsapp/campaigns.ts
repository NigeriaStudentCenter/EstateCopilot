// Outbound campaign engine: send an approved WhatsApp template to a queried,
// consented audience, throttled, with a per-contact frequency cap.
//
// Scope for now:
//  - Audience segments: an explicit phone list, everyone with marketing
//    consent for a brand, and past artisan-quote requesters. More segments
//    (leases expiring, landlords with no listing) go in later — they need
//    careful queries against the core models.
//  - runCampaign() streams sends from the API process on a timer. Fine for
//    a pilot; a large audience wants a dedicated worker (WebJob) instead.
//  - Every send requires hasMarketingConsent(phone) AND no campaign message
//    to that number in the last WA_CAMPAIGN_MIN_GAP_DAYS.

import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { sendWhatsAppTemplate } from '../whatsapp.js';
import { mockArtisanLeads } from '../../lib/mockArtisanLeads.js';
import { MOCK_TENANCIES } from '../../lib/mockTenancies.js';
import { mockLandlords } from '../../lib/mockLandlords.js';
import { MOCK_PROPERTIES } from '../../lib/mockProperties.js';
import { hasMarketingConsent, normalizePhone } from './consent.js';
import type { WaBrand } from './brands.js';

const THROTTLE_PER_MIN = Math.max(1, Number(process.env.WA_CAMPAIGN_THROTTLE_PER_MIN ?? 60));
const MIN_GAP_DAYS = Math.max(0, Number(process.env.WA_CAMPAIGN_MIN_GAP_DAYS ?? 7));
const MAX_PER_RUN = 500; // safety ceiling for the in-process sender

export interface AudienceQuery {
  /** Explicit numbers (any format — normalised here). */
  phones?: string[];
  segment?: 'consented' | 'artisan_leads' | 'tenancies_expiring' | 'landlords_no_listing';
  /** For 'consented': restrict to a brand. */
  brand?: WaBrand;
  /** For 'artisan_leads': lead status filter, e.g. "NEW". */
  status?: string;
  /** For 'artisan_leads': only leads older than N days (nudge stale ones). */
  olderThanDays?: number;
  /** For 'tenancies_expiring': lease ends within N days (default 60). */
  withinDays?: number;
}

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'DONE';

export interface Campaign {
  id: string;
  name: string;
  brand: WaBrand;
  templateName: string;
  templateLang: string;
  audienceQuery: AudienceQuery;
  scheduleAt?: string | null;
  status: CampaignStatus;
  stats?: Record<string, number> | null;
  createdAt: string | Date;
}

// ---- store (mock vs Prisma) ---------------------------------------

const mockCampaigns: Campaign[] = [];

export async function createCampaign(input: {
  name: string;
  brand?: WaBrand;
  templateName: string;
  templateLang?: string;
  audienceQuery: AudienceQuery;
  scheduleAt?: string | null;
}): Promise<Campaign> {
  const data = {
    name: input.name,
    brand: input.brand ?? ('ESTATECOPILOT' as WaBrand),
    templateName: input.templateName,
    templateLang: input.templateLang ?? 'en',
    audienceQuery: input.audienceQuery,
    scheduleAt: input.scheduleAt ?? null,
    status: 'DRAFT' as CampaignStatus,
  };
  if (env.mockMode) {
    const c: Campaign = { id: `wac_${Date.now()}`, createdAt: new Date().toISOString(), stats: null, ...data };
    mockCampaigns.push(c);
    return c;
  }
  return (await prisma.waCampaign.create({ data: data as any })) as unknown as Campaign;
}

export async function listCampaigns(): Promise<Campaign[]> {
  if (env.mockMode) return [...mockCampaigns].reverse();
  return (await prisma.waCampaign.findMany({ orderBy: { createdAt: 'desc' } })) as unknown as Campaign[];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  if (env.mockMode) return mockCampaigns.find((c) => c.id === id) ?? null;
  return (await prisma.waCampaign.findUnique({ where: { id } })) as unknown as Campaign | null;
}

async function patchCampaign(id: string, patch: Partial<Campaign>): Promise<void> {
  if (env.mockMode) {
    const c = mockCampaigns.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
    return;
  }
  await prisma.waCampaign.update({ where: { id }, data: patch as any }).catch(() => {});
}

// Move a DRAFT/PAUSED campaign to SCHEDULED — the scheduler fires it once
// `scheduleAt` passes. Rejects a campaign that has already run.
export async function scheduleCampaign(id: string, scheduleAt: string): Promise<Campaign | null> {
  const c = await getCampaign(id);
  if (!c) return null;
  if (c.status === 'RUNNING' || c.status === 'DONE') return c;
  await patchCampaign(id, { status: 'SCHEDULED', scheduleAt });
  return getCampaign(id);
}

export async function cancelSchedule(id: string): Promise<Campaign | null> {
  const c = await getCampaign(id);
  if (!c) return null;
  if (c.status === 'SCHEDULED') await patchCampaign(id, { status: 'DRAFT', scheduleAt: null });
  return getCampaign(id);
}

// Campaigns that are due to fire now — polled by the scheduler.
export async function dueCampaigns(now = Date.now()): Promise<Campaign[]> {
  return (await listCampaigns()).filter(
    (c) => c.status === 'SCHEDULED' && !!c.scheduleAt && new Date(c.scheduleAt).getTime() <= now,
  );
}

// ---- audience ----------------------------------------------------

async function resolveCandidates(q: AudienceQuery): Promise<string[]> {
  const out = new Set<string>();

  for (const p of q.phones ?? []) out.add(normalizePhone(p));

  if (q.segment === 'consented') {
    if (!env.mockMode) {
      const rows = await prisma.waConsent.findMany({
        where: { marketingOptIn: true, optOutAt: null, ...(q.brand ? { brand: q.brand } : {}) },
        include: { contact: true },
      });
      for (const r of rows) if (r.contact?.phone) out.add(r.contact.phone);
    }
    // mock: the consent store is in-memory in consent.ts and not enumerable
    // from here — use an explicit `phones` list in mock mode.
  }

  if (q.segment === 'artisan_leads') {
    const cutoff = q.olderThanDays ? Date.now() - q.olderThanDays * 86_400_000 : null;
    if (env.mockMode) {
      for (const l of mockArtisanLeads) {
        if (q.status && l.status !== q.status) continue;
        if (cutoff && new Date(l.createdAt).getTime() > cutoff) continue;
        out.add(normalizePhone(l.requesterPhone));
      }
    } else {
      const rows = await prisma.artisanLead.findMany({
        where: {
          ...(q.status ? { status: q.status as any } : {}),
          ...(cutoff ? { createdAt: { lt: new Date(cutoff) } } : {}),
        },
        select: { requesterPhone: true },
      });
      for (const r of rows) out.add(normalizePhone(r.requesterPhone));
    }
  }

  // Tenants whose lease ends soon — renewal nudge (a UTILITY template).
  if (q.segment === 'tenancies_expiring') {
    const now = Date.now();
    const horizon = now + (q.withinDays ?? 60) * 86_400_000;
    if (env.mockMode) {
      for (const t of MOCK_TENANCIES) {
        if (t.paymentStatus === 'TERMINATED') continue;
        const end = new Date(t.leaseEndDate).getTime();
        if (end >= now && end <= horizon) out.add(normalizePhone(t.tenantPhone));
      }
    } else {
      const rows = await prisma.tenancy.findMany({
        where: { leaseEnd: { gte: new Date(now), lte: new Date(horizon) }, paymentStatus: { not: 'TERMINATED' as any } },
        select: { tenant: { select: { phone: true } } },
      });
      for (const r of rows) if (r.tenant?.phone) out.add(normalizePhone(r.tenant.phone));
    }
  }

  // Landlords who have paid but never advertised a property — activation nudge.
  if (q.segment === 'landlords_no_listing') {
    if (env.mockMode) {
      for (const l of mockLandlords.values()) {
        if (l.subscriptionStatus !== 'ACTIVE') continue;
        if (MOCK_PROPERTIES.some((p) => p.landlordId === l.id && p.isAdvertised)) continue;
        out.add(normalizePhone(l.phone));
      }
    } else {
      const rows = await prisma.landlord.findMany({
        where: { subscriptionStatus: 'ACTIVE' as any, properties: { none: { isAdvertised: true } } },
        select: { phone: true },
      });
      for (const r of rows) out.add(normalizePhone(r.phone));
    }
  }

  return [...out];
}

async function recentlyMessaged(phones: string[]): Promise<Set<string>> {
  if (MIN_GAP_DAYS === 0 || env.mockMode || phones.length === 0) return new Set();
  const cutoff = new Date(Date.now() - MIN_GAP_DAYS * 86_400_000);
  const rows = await prisma.whatsAppMessage.findMany({
    where: {
      direction: 'OUTBOUND',
      templateName: { not: null },
      toNumber: { in: phones },
      createdAt: { gte: cutoff },
    },
    select: { toNumber: true },
  });
  return new Set(rows.map((r) => r.toNumber));
}

// Consented, not recently campaigned, deduped.
export async function resolveAudience(q: AudienceQuery): Promise<string[]> {
  const candidates = await resolveCandidates(q);
  const recent = await recentlyMessaged(candidates);
  const eligible: string[] = [];
  for (const phone of candidates) {
    if (recent.has(phone)) continue;
    if (!(await hasMarketingConsent(phone))) continue;
    eligible.push(phone);
  }
  return eligible;
}

// ---- run -------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function previewCampaign(id: string): Promise<{ audienceSize: number; sample: string[] } | null> {
  const c = await getCampaign(id);
  if (!c) return null;
  const audience = await resolveAudience(c.audienceQuery);
  return { audienceSize: audience.length, sample: audience.slice(0, 5) };
}

// Kicked off without awaiting by the route — returns once it has started.
export async function runCampaign(id: string): Promise<{ started: boolean; reason?: string; audienceSize?: number }> {
  const c = await getCampaign(id);
  if (!c) return { started: false, reason: 'not found' };
  if (c.status === 'RUNNING' || c.status === 'DONE') return { started: false, reason: `already ${c.status.toLowerCase()}` };

  const audience = (await resolveAudience(c.audienceQuery)).slice(0, MAX_PER_RUN);
  await patchCampaign(id, { status: 'RUNNING', stats: { total: audience.length, sent: 0, failed: 0 } });

  const delayMs = Math.ceil(60_000 / THROTTLE_PER_MIN);
  void (async () => {
    let sent = 0;
    let failed = 0;
    for (const phone of audience) {
      const r = await sendWhatsAppTemplate(phone, c.templateName, c.templateLang);
      if (r.sent) {
        sent++;
        if (!env.mockMode) {
          await prisma.whatsAppMessage
            .create({
              data: {
                direction: 'OUTBOUND',
                fromNumber: '',
                toNumber: phone,
                body: `[template:${c.templateName}]`,
                waMessageId: r.id,
                templateName: c.templateName,
                brand: c.brand === 'UNKNOWN' ? null : c.brand,
              },
            })
            .catch(() => {});
        }
      } else {
        failed++;
      }
      await patchCampaign(id, { stats: { total: audience.length, sent, failed } });
      await sleep(delayMs);
    }
    await patchCampaign(id, { status: 'DONE', stats: { total: audience.length, sent, failed } });
    console.log(`[whatsapp:campaign] ${c.name} done — ${sent} sent, ${failed} failed`);
  })();

  return { started: true, audienceSize: audience.length };
}
