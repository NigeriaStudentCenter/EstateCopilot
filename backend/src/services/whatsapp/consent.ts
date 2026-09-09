// Marketing consent for WhatsApp. A logged, explicit opt-in is required
// before any business-initiated (campaign) message; an opt-out must be
// honoured immediately and permanently. Same mock/Prisma split as the rest
// of the WhatsApp module.
//
// The marketing site's lead forms POST here when the "message me on
// WhatsApp" box is ticked; the agent records an opt-out when someone replies
// STOP.

import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import type { WaBrand } from './brands.js';

export interface ConsentInput {
  phone: string;
  brand?: WaBrand;
  source: string; // "listing_form" | "artisan_form" | "click_to_chat" | "import" | "whatsapp_reply"
  optInText?: string;
  marketingOptIn?: boolean;
  ip?: string;
}

// Nigeria/UK phone entered on a web form -> the E.164-without-'+' shape the
// rest of the system stores (e.g. "2348030001111"). Best-effort; a number we
// can't confidently normalise is stored as its digits.
export function normalizePhone(raw: string): string {
  let d = String(raw).replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1); // 080... -> 23480...
  if (d.startsWith('0') && d.length === 11 && d[1] === '7') d = '44' + d.slice(1); // UK 07... -> 447...
  return d;
}

// ---- mock store -----------------------------------------------------

interface ConsentRow {
  phone: string;
  brand: WaBrand;
  marketingOptIn: boolean;
  source: string;
  optInText?: string;
  ip?: string;
  optInAt?: string;
  optOutAt?: string;
}
const mockConsent = new Map<string, ConsentRow>();

// ---- API -----------------------------------------------------------

export async function recordConsent(input: ConsentInput): Promise<void> {
  const phone = normalizePhone(input.phone);
  const brand = input.brand ?? 'UNKNOWN';
  const optIn = input.marketingOptIn !== false;

  if (env.mockMode) {
    const prev = mockConsent.get(phone);
    mockConsent.set(phone, {
      phone,
      brand,
      marketingOptIn: optIn,
      source: input.source,
      optInText: input.optInText,
      ip: input.ip,
      optInAt: optIn ? new Date().toISOString() : prev?.optInAt,
      // A fresh opt-in clears a prior opt-out.
      optOutAt: optIn ? undefined : prev?.optOutAt,
    });
    return;
  }

  const contact = await prisma.waContact.upsert({
    where: { phone },
    create: { phone },
    update: {},
  });
  await prisma.waConsent.upsert({
    where: { contactId: contact.id },
    create: {
      contactId: contact.id,
      marketingOptIn: optIn,
      brand,
      source: input.source,
      optInText: input.optInText,
      ip: input.ip,
      optInAt: optIn ? new Date() : null,
    },
    update: {
      marketingOptIn: optIn,
      brand,
      source: input.source,
      optInText: input.optInText,
      ip: input.ip,
      ...(optIn ? { optInAt: new Date(), optOutAt: null } : {}),
    },
  });
}

export async function recordOptOut(rawPhone: string): Promise<void> {
  const phone = normalizePhone(rawPhone);
  if (env.mockMode) {
    const prev = mockConsent.get(phone);
    mockConsent.set(phone, {
      phone,
      brand: prev?.brand ?? 'UNKNOWN',
      marketingOptIn: false,
      source: prev?.source ?? 'whatsapp_reply',
      optInText: prev?.optInText,
      ip: prev?.ip,
      optInAt: prev?.optInAt,
      optOutAt: new Date().toISOString(),
    });
    return;
  }
  const contact = await prisma.waContact.findUnique({ where: { phone } });
  if (!contact) {
    // No prior record — still capture the opt-out so a later import can't
    // re-add them.
    const c = await prisma.waContact.create({ data: { phone } });
    await prisma.waConsent.create({
      data: { contactId: c.id, marketingOptIn: false, source: 'whatsapp_reply', optOutAt: new Date() },
    });
    return;
  }
  await prisma.waConsent.upsert({
    where: { contactId: contact.id },
    create: { contactId: contact.id, marketingOptIn: false, source: 'whatsapp_reply', optOutAt: new Date() },
    update: { marketingOptIn: false, optOutAt: new Date() },
  });
}

// True only if the contact has opted in and has not since opted out.
export async function hasMarketingConsent(rawPhone: string): Promise<boolean> {
  const phone = normalizePhone(rawPhone);
  if (env.mockMode) {
    const row = mockConsent.get(phone);
    return !!row && row.marketingOptIn && !row.optOutAt;
  }
  const contact = await prisma.waContact.findUnique({ where: { phone }, include: { consent: true } });
  const c = contact?.consent;
  return !!c && c.marketingOptIn && !c.optOutAt;
}

// STOP / UNSUBSCRIBE / opt out — matched before the message reaches the LLM.
const OPT_OUT_RE = /^\s*(stop|stop\s+promotions?|unsubscribe|cancel|opt[\s-]?out|remove me)\b/i;
export function isOptOut(text: string): boolean {
  return OPT_OUT_RE.test(text);
}
