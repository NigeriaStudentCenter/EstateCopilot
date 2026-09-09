// Tools the marketing agent can call. Each brand gets only its own set.
//
// Rules that hold for every tool here:
//  - Read paths return only public / already-advertised data.
//  - Write paths are limited to *non-contractual* actions: capturing a lead,
//    requesting a quote, booking a viewing slot, handing off to a human.
//    Nothing agrees rent, takes payment, or confirms a place.
//  - Every tool works in MOCK_MODE with no database, mirroring the rest of
//    the codebase, so the agent is testable end to end without credentials.

import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { MOCK_PROPERTIES } from '../../lib/mockProperties.js';
import { createMockBooking } from '../../lib/mockBookings.js';
import { createMockLead } from '../../lib/mockArtisanLeads.js';
import { mockArtisans } from '../../lib/mockArtisans.js';
import { notifyOps } from '../../lib/notifyOps.js';
import { computeArtisanScore } from '../../lib/artisanScore.js';
import { TRADES, isTradeId, tradeLabel, type TradeId } from '../../lib/trades.js';
import type { WaBrand } from './brands.js';
import { brandProfile } from './brands.js';
import { setState, type Conversation } from './conversationStore.js';

export interface ToolContext {
  from: string; // the customer's WhatsApp number, E.164 without '+'
  convo: Conversation;
}

// Anthropic tool schema. Kept deliberately small — WhatsApp answers are short
// and the model should ask for a missing field rather than guess it.
interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const bedsInTitle = (title: string): number | null => {
  const m = title.match(/(\d+)\s*-?\s*bed/i);
  return m ? Number(m[1]) : null;
};
const ci = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());

// ---- EstateCopilot: listings -----------------------------------------

// Normalised across the mock store and Prisma so the tool logic below never
// has to branch on env.mockMode again.
interface Listing {
  id: string;
  title: string;
  address: string;
  state: string;
  lga: string;
  propertyType: 'LONG_TERM' | 'SHORT_LET';
  rentAmount: number;
  cautionDepositAmount: number;
  listingDescription?: string | null;
  imageUrls: string[];
}

async function loadAdvertisedProperties(): Promise<Listing[]> {
  const rows = env.mockMode
    ? MOCK_PROPERTIES.filter((p) => p.isAdvertised)
    : await prisma.property.findMany({ where: { isAdvertised: true }, orderBy: { createdAt: 'desc' } });
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    address: p.address,
    state: p.state,
    lga: p.lga,
    propertyType: p.propertyType as 'LONG_TERM' | 'SHORT_LET',
    rentAmount: p.rentAmount,
    cautionDepositAmount: p.cautionDepositAmount,
    listingDescription: p.listingDescription ?? null,
    imageUrls: p.imageUrls ?? [],
  }));
}

async function searchListings(input: {
  area?: string;
  propertyType?: string;
  maxRent?: number;
  minBedrooms?: number;
}): Promise<string> {
  let list = await loadAdvertisedProperties();

  if (input.area) {
    const a = input.area;
    list = list.filter((p) => ci(p.state, a) || ci(p.lga, a) || ci(p.address, a) || ci(p.title, a));
  }
  if (input.propertyType) {
    const t = input.propertyType.toUpperCase();
    list = list.filter((p) => p.propertyType === t);
  }
  if (typeof input.maxRent === 'number') {
    list = list.filter((p) => p.rentAmount <= input.maxRent!);
  }
  if (typeof input.minBedrooms === 'number') {
    list = list.filter((p) => {
      const b = bedsInTitle(p.title);
      return b === null || b >= input.minBedrooms!;
    });
  }

  if (list.length === 0) {
    return 'No advertised listings match that. Use capture_lead to record what they are looking for so the team can follow up.';
  }

  return list
    .slice(0, 5)
    .map(
      (p) =>
        `#${p.id} — ${p.title} · ${p.lga}, ${p.state} · ${naira(p.rentAmount)}${
          p.propertyType === 'LONG_TERM' ? '/year' : ' (short-let)'
        }`,
    )
    .join('\n');
}

async function getListingDetails(input: { listingId: string }): Promise<string> {
  const id = String(input.listingId).replace(/^#/, '');
  const list = await loadAdvertisedProperties();
  const p = list.find((x) => x.id === id);
  if (!p) return 'No advertised listing with that id. Re-run search_listings.';
  return [
    `${p.title} (#${p.id})`,
    `Area: ${p.lga}, ${p.state}`,
    `Type: ${p.propertyType === 'LONG_TERM' ? 'Long-term rental' : 'Short-let'}`,
    `Rent: ${naira(p.rentAmount)}${p.propertyType === 'LONG_TERM' ? '/year' : ''}`,
    `Caution deposit: ${naira(p.cautionDepositAmount)}`,
    p.listingDescription ? `Description: ${p.listingDescription}` : 'Description: (none on file)',
    `Photos on the listing: ${p.imageUrls?.length ?? 0}`,
    'To arrange a viewing, use book_viewing (need their name and a preferred day/time).',
  ].join('\n');
}

async function bookViewing(
  input: { listingId: string; name: string; preferredTime: string; notes?: string },
  ctx: ToolContext,
): Promise<string> {
  const id = String(input.listingId).replace(/^#/, '');
  const list = await loadAdvertisedProperties();
  const p = list.find((x) => x.id === id);
  if (!p) return 'No advertised listing with that id — cannot book. Re-run search_listings.';
  if (!input.name || !input.preferredTime) {
    return 'Need both the visitor name and a preferred day/time before booking. Ask for whichever is missing.';
  }

  if (env.mockMode) {
    createMockBooking({
      type: 'PROPERTY_VIEWING',
      propertyId: p.id,
      requesterName: input.name,
      requesterPhone: ctx.from,
      scheduledFor: input.preferredTime,
      notes: input.notes,
    });
  } else {
    await prisma.booking.create({
      data: {
        type: 'PROPERTY_VIEWING',
        propertyId: p.id,
        requesterName: input.name,
        requesterPhone: ctx.from,
        // Free-text preferred time from chat — stored as a note, ops confirms
        // an exact slot. Not parsed into a Date to avoid a wrong commitment.
        scheduledFor: new Date(),
        notes: `Preferred: ${input.preferredTime}${input.notes ? ` — ${input.notes}` : ''} (via WhatsApp)`,
      },
    });
  }

  await notifyOps(
    `New viewing request (WhatsApp): ${p.title}`,
    `${input.name} (${ctx.from}) asked to view "${p.title}" — ${p.lga}, ${p.state}.\nPreferred: ${input.preferredTime}${
      input.notes ? `\nNote: ${input.notes}` : ''
    }`,
  );
  return `Viewing request logged for ${input.name} at "${p.title}". Tell them the team will confirm an exact slot on WhatsApp. Do not promise a specific time yourself.`;
}

// ---- EstateCopilot: artisans ----------------------------------------

interface ListedArtisan {
  id: string;
  name: string;
  businessName?: string | null;
  phone: string;
  baseState: string;
  baseLga: string;
  coverageLgas: string[];
  verificationTier: number;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  lastActiveAt: string | Date;
  trades: { trade: string; isPrimary: boolean }[];
}

async function loadListedArtisans(): Promise<ListedArtisan[]> {
  if (env.mockMode) {
    return [...mockArtisans.values()]
      .filter((a) => a.isListed && a.verificationTier >= 1)
      .map((a) => ({
        id: a.id,
        name: a.name,
        businessName: a.businessName ?? null,
        phone: a.phone,
        baseState: a.baseState,
        baseLga: a.baseLga,
        coverageLgas: a.coverageLgas,
        verificationTier: a.verificationTier,
        ratingAvg: a.ratingAvg,
        ratingCount: a.ratingCount,
        jobsCompleted: a.jobsCompleted,
        lastActiveAt: a.lastActiveAt,
        trades: a.trades.map((t) => ({ trade: t.trade as string, isPrimary: t.isPrimary })),
      }));
  }
  const rows = await prisma.artisan.findMany({
    where: { isListed: true, verificationTier: { gte: 1 } },
    include: { trades: { select: { trade: true, isPrimary: true } } },
  });
  return rows as unknown as ListedArtisan[];
}

// "electrician", "ELECTRICIAN", "electrical work" -> TradeId
function resolveTrade(raw?: string): TradeId | undefined {
  if (!raw) return undefined;
  if (isTradeId(raw)) return raw as TradeId;
  const q = raw.toLowerCase().trim();
  const hit = TRADES.find((t) => t.id.toLowerCase() === q || tradeLabel(t.id).toLowerCase() === q);
  if (hit) return hit.id as TradeId;
  const partial = TRADES.find((t) => q.includes(tradeLabel(t.id).toLowerCase()) || tradeLabel(t.id).toLowerCase().includes(q));
  return partial ? (partial.id as TradeId) : undefined;
}

async function searchArtisans(input: { trade?: string; area?: string }): Promise<string> {
  let list = await loadListedArtisans();
  const trade = resolveTrade(input.trade);

  if (trade) list = list.filter((a) => a.trades.some((t) => t.trade === trade));
  if (input.area) {
    const a = input.area;
    list = list.filter(
      (x) => ci(x.baseState, a) || ci(x.baseLga, a) || x.coverageLgas.some((l) => ci(l, a)),
    );
  }

  if (list.length === 0) {
    return `No verified artisan${trade ? ` for ${tradeLabel(trade)}` : ''}${
      input.area ? ` around ${input.area}` : ''
    }. Use capture_lead to record the request.`;
  }

  const ranked = list
    .map((a) => ({
      a,
      score: computeArtisanScore({
        ratingAvg: a.ratingAvg,
        ratingCount: a.ratingCount,
        jobsCompleted: a.jobsCompleted,
        verificationTier: a.verificationTier,
        lastActiveAt: a.lastActiveAt,
      }),
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);

  return ranked
    .map(({ a }) => {
      const primary = a.trades.find((t) => t.isPrimary) ?? a.trades[0];
      return `#${a.id} — ${a.name}${a.businessName ? ` (${a.businessName})` : ''} · ${
        primary ? tradeLabel(primary.trade as TradeId) : 'trade n/a'
      } · ${a.baseLga}, ${a.baseState} · ★${a.ratingAvg.toFixed(1)} (${a.ratingCount}) · tier ${a.verificationTier}`;
    })
    .join('\n');
}

async function requestArtisanQuote(
  input: { artisanId: string; requesterName: string; description: string },
  ctx: ToolContext,
): Promise<string> {
  const id = String(input.artisanId).replace(/^#/, '');
  const list = await loadListedArtisans();
  const a = list.find((x) => x.id === id);
  if (!a) return 'No verified artisan with that id. Re-run search_artisans.';
  if (!input.requesterName || !input.description) {
    return 'Need the requester name and a short description of the job before sending. Ask for whichever is missing.';
  }

  const primaryTrade = a.trades.find((t) => t.isPrimary)?.trade;
  if (env.mockMode) {
    createMockLead({
      artisanId: a.id,
      requesterName: input.requesterName,
      requesterPhone: ctx.from,
      requesterRole: 'other',
      lga: a.baseLga,
      trade: primaryTrade && isTradeId(primaryTrade) ? (primaryTrade as TradeId) : undefined,
      message: input.description,
    });
  } else {
    await prisma.artisanLead.create({
      data: {
        artisanId: a.id,
        requesterName: input.requesterName,
        requesterPhone: ctx.from,
        requesterRole: 'other',
        lga: a.baseLga,
        trade: primaryTrade && isTradeId(primaryTrade) ? (primaryTrade as TradeId) : null,
        message: input.description,
      },
    });
    await prisma.artisan.update({ where: { id: a.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
  }

  await notifyOps(
    `Artisan quote request (WhatsApp) — ${a.name}`,
    `${input.requesterName} (${ctx.from}) wants a quote from ${a.name}${
      a.businessName ? ` / ${a.businessName}` : ''
    } (${a.phone}).\n\n"${input.description}"`,
  );
  return `Quote request sent to ${a.name}. Tell the user ${a.name} will contact them on this number.`;
}

async function captureLead(
  input: { intent: string; name?: string; details: string },
  ctx: ToolContext,
  brand: WaBrand,
): Promise<string> {
  const label = brandProfile(brand)?.label ?? 'EstateCopilot';
  await notifyOps(
    `${label} WhatsApp lead — ${input.intent}`,
    `From ${input.name ?? 'unknown'} (${ctx.from}).\n\n${input.details}`,
  );
  return 'Lead captured. Tell the user the team will follow up on this WhatsApp number.';
}

// ---- AI Academy -----------------------------------------------------

async function getAcademyInfo(_input: { question?: string }): Promise<string> {
  const p = brandProfile('AI_ACADEMY')!;
  return `${p.faq}\n\nMore info: ${p.siteUrl}\n(Only state facts that appear above. For anything else, capture the enquiry.)`;
}

async function captureAcademyLead(
  input: {
    interest: string;
    programme?: string; // teens | university | professional
    studentName?: string;
    parentName?: string;
    ageOrClass?: string;
    location?: string;
    contactPreference?: string;
  },
  ctx: ToolContext,
): Promise<string> {
  await notifyOps(
    'AI Academy enrolment enquiry (WhatsApp)',
    [
      `Interest: ${input.interest}`,
      input.programme ? `Programme: ${input.programme}` : null,
      input.studentName ? `Student: ${input.studentName}` : null,
      input.parentName ? `Parent/guardian: ${input.parentName}` : null,
      input.ageOrClass ? `Age/level: ${input.ageOrClass}` : null,
      input.location ? `Location: ${input.location}` : null,
      `Contact: ${ctx.from}${input.contactPreference ? ` (${input.contactPreference})` : ''}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return `Enquiry captured. Share this link to start the onboarding form: ${env.aiAcademy.onboardingUrl} — then the team confirms a place and schedule.`;
}

// ---- shared -------------------------------------------------------

async function escalateToHuman(input: { reason: string }, ctx: ToolContext, brand: WaBrand): Promise<string> {
  await setState(ctx.convo, 'HUMAN_ACTIVE');
  const label = brandProfile(brand)?.label ?? 'EstateCopilot/AI Academy';
  await notifyOps(
    `${label} WhatsApp — needs a human`,
    `Conversation with ${ctx.from} was handed off.\nReason: ${input.reason}`,
  );
  return 'Handed to a team member. Tell the user a person will reply here shortly, then stop.';
}

// ---- registry ----------------------------------------------------

const LISTING_TOOLS: ToolDef[] = [
  {
    name: 'search_listings',
    description: 'Search advertised EstateCopilot rental listings by area, type, max yearly rent and minimum bedrooms.',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Town, LGA or state, e.g. "Lekki", "Surulere", "Lagos"' },
        propertyType: { type: 'string', enum: ['LONG_TERM', 'SHORT_LET'] },
        maxRent: { type: 'number', description: 'Maximum yearly rent in Naira' },
        minBedrooms: { type: 'number' },
      },
    },
  },
  {
    name: 'get_listing_details',
    description: 'Full details for one listing id returned by search_listings.',
    input_schema: {
      type: 'object',
      properties: { listingId: { type: 'string' } },
      required: ['listingId'],
    },
  },
  {
    name: 'book_viewing',
    description: 'Log a viewing request for a listing. Does NOT confirm a time — ops does that. Needs visitor name and a preferred day/time.',
    input_schema: {
      type: 'object',
      properties: {
        listingId: { type: 'string' },
        name: { type: 'string' },
        preferredTime: { type: 'string', description: 'Free text, e.g. "Saturday morning"' },
        notes: { type: 'string' },
      },
      required: ['listingId', 'name', 'preferredTime'],
    },
  },
];

const ARTISAN_TOOLS: ToolDef[] = [
  {
    name: 'search_artisans',
    description: 'Search the verified artisan (tradesperson) directory by trade and area.',
    input_schema: {
      type: 'object',
      properties: {
        trade: { type: 'string', description: 'e.g. "electrician", "plumber", "tiler"' },
        area: { type: 'string', description: 'LGA or state' },
      },
    },
  },
  {
    name: 'request_artisan_quote',
    description: 'Send a quote request to one artisan id from search_artisans. Needs requester name and a job description.',
    input_schema: {
      type: 'object',
      properties: {
        artisanId: { type: 'string' },
        requesterName: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['artisanId', 'requesterName', 'description'],
    },
  },
];

const CAPTURE_LEAD_TOOL: ToolDef = {
  name: 'capture_lead',
  description: 'Record a lead for the team when no other tool fits (e.g. a landlord wanting to list, a request with no match).',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'Short label, e.g. "landlord wants to list", "rental enquiry no match"' },
      name: { type: 'string' },
      details: { type: 'string', description: 'Everything useful the user said' },
    },
    required: ['intent', 'details'],
  },
};

const ACADEMY_TOOLS: ToolDef[] = [
  {
    name: 'get_academy_info',
    description: 'Retrieve the approved AI Academy facts. Answer only from what this returns.',
    input_schema: { type: 'object', properties: { question: { type: 'string' } } },
  },
  {
    name: 'capture_academy_lead',
    description: 'Record an AI Academy enrolment enquiry and hand back the onboarding link.',
    input_schema: {
      type: 'object',
      properties: {
        interest: { type: 'string', description: 'What they asked about / want' },
        programme: { type: 'string', enum: ['teens', 'university', 'professional'] },
        studentName: { type: 'string' },
        parentName: { type: 'string', description: 'For the teens programme only' },
        ageOrClass: { type: 'string', description: 'Age (teens) or level/role (university, professional)' },
        location: { type: 'string' },
        contactPreference: { type: 'string' },
      },
      required: ['interest'],
    },
  },
];

const ESCALATE_TOOL: ToolDef = {
  name: 'escalate_to_human',
  description:
    'Hand the conversation to a person. Use for anything financial, legal or contractual, complaints, or when the user is stuck. After calling this, tell the user a person will follow up and stop.',
  input_schema: {
    type: 'object',
    properties: { reason: { type: 'string' } },
    required: ['reason'],
  },
};

export function toolsForBrand(brand: WaBrand): ToolDef[] {
  if (brand === 'ESTATECOPILOT') {
    return [...LISTING_TOOLS, ...ARTISAN_TOOLS, CAPTURE_LEAD_TOOL, ESCALATE_TOOL];
  }
  if (brand === 'AI_ACADEMY') {
    return [...ACADEMY_TOOLS, ESCALATE_TOOL];
  }
  // UNKNOWN — the persona asks which service they mean; only escalation is
  // available until the brand is pinned.
  return [ESCALATE_TOOL];
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  brand: WaBrand,
): Promise<string> {
  try {
    switch (name) {
      case 'search_listings':
        return await searchListings(input as any);
      case 'get_listing_details':
        return await getListingDetails(input as any);
      case 'book_viewing':
        return await bookViewing(input as any, ctx);
      case 'search_artisans':
        return await searchArtisans(input as any);
      case 'request_artisan_quote':
        return await requestArtisanQuote(input as any, ctx);
      case 'capture_lead':
        return await captureLead(input as any, ctx, brand);
      case 'get_academy_info':
        return await getAcademyInfo(input as any);
      case 'capture_academy_lead':
        return await captureAcademyLead(input as any, ctx);
      case 'escalate_to_human':
        return await escalateToHuman(input as any, ctx, brand);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    console.error(`[whatsapp:agent] tool ${name} threw`, err);
    return 'That action could not be completed right now. Offer to have the team follow up.';
  }
}
