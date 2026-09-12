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
import type { Conversation } from './conversationStore.js';
import {
  ACADEMY_LANDING_URL,
  ACADEMY_LEARNER_GUIDE_URL,
  ACADEMY_CATALOGUE_URL,
  ACADEMY_PAYMENT_URL,
  ACADEMY_COURSES,
  findAcademyCourse,
} from './academyCatalogue.js';
import {
  TEENS_CURRICULUM_URL,
  TEENS_SAFETY_URL,
  TEENS_SEL_URL,
  TEENS_PAYMENT_URL,
  TEENS_TRACKS,
  findTeensTrack,
} from './academyTeensCatalogue.js';
import {
  LANDLORD_FEATURES,
  findLandlordFeature,
  landlordFeatureImageUrl,
  landlordFeatureGuideUrl,
  TENANT_FEATURES,
  findTenantFeature,
  tenantFeatureImageUrl,
  tenantFeatureGuideUrl,
  ARTISAN_FEATURES,
  findArtisanFeature,
  artisanFeatureImageUrl,
  artisanFeatureGuideUrl,
  PARTNER_FEATURES,
  findPartnerFeature,
  partnerFeatureImageUrl,
  partnerFeatureGuideUrl,
} from './featureGuides.js';
import {
  ONBOARDING,
  ONBOARDING_AUDIENCES,
  isOnboardingAudience,
  audienceMenu,
  onboardingOverview,
  onboardingStep,
  imageUrl,
  videoUrl,
  guideUrl,
  type OnboardingAudience,
} from './onboarding.js';

export interface MediaAttachment {
  kind: 'image' | 'video';
  link: string;
  caption?: string;
}

export interface ToolContext {
  from: string; // the customer's WhatsApp number, E.164 without '+'
  convo: Conversation;
  /** Tools push here to have media sent alongside the agent's text reply. */
  media: MediaAttachment[];
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
  input: { listingId: string; name: string; preferredTime: string; email?: string; notes?: string },
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
      requesterEmail: input.email,
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
        requesterEmail: input.email,
        // Free-text preferred time from chat — stored as a note, ops confirms
        // an exact slot. Not parsed into a Date to avoid a wrong commitment.
        scheduledFor: new Date(),
        notes: `Preferred: ${input.preferredTime}${input.notes ? ` — ${input.notes}` : ''} (via WhatsApp)`,
      },
    });
  }

  await notifyOps(
    `New viewing request (WhatsApp): ${p.title}`,
    `${input.name} (${ctx.from}${input.email ? `, ${input.email}` : ''}) asked to view "${p.title}" — ${p.lga}, ${p.state}.\nPreferred: ${input.preferredTime}${
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
  input: { artisanId: string; requesterName: string; description: string; email?: string },
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
      requesterEmail: input.email,
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
        requesterEmail: input.email,
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
    `${input.requesterName} (${ctx.from}${input.email ? `, ${input.email}` : ''}) wants a quote from ${a.name}${
      a.businessName ? ` / ${a.businessName}` : ''
    } (${a.phone}).\n\n"${input.description}"`,
  );
  return `Quote request sent to ${a.name}. Tell the user ${a.name} will contact them on this number.`;
}

// Walks a user through getting started, one step at a time, for whichever
// track fits them: landlord, tenant, artisan or referral (Kolo) partner.
// The agent categorises the audience from the conversation. Omitting `step`
// returns that track's overview; a step number returns that step and queues
// its illustration (and, for the landlord intro, the walkthrough video).
async function getOnboarding(input: { audience?: string; step?: number }, ctx: ToolContext): Promise<string> {
  if (!isOnboardingAudience(input.audience)) {
    return (
      `Pick which onboarding track fits this person, then call get_onboarding again with that audience:\n${audienceMenu()}\n` +
      `Valid audience values: ${ONBOARDING_AUDIENCES.join(', ')}.`
    );
  }
  const audience = input.audience as OnboardingAudience;
  const track = ONBOARDING[audience];

  if (!input.step) {
    if (audience === 'landlord') {
      ctx.media.push({
        kind: 'video',
        link: videoUrl('walkthrough.mp4'),
        caption: 'EstateCopilot for landlords — quick walkthrough',
      });
    }
    return (
      `${onboardingOverview(audience)}\n\n` +
      `Tell the user you can walk them through it here, one step at a time — they say "next" or give a step number. ` +
      `Full illustrated guide: ${guideUrl(audience)}`
    );
  }

  const s = onboardingStep(audience, input.step);
  if (!s) return `The ${audience} track has ${track.steps.length} steps (1–${track.steps.length}). Ask the user which one.`;

  if (s.image) ctx.media.push({ kind: 'image', link: imageUrl(s.image), caption: `Step ${s.n}: ${s.title}` });
  if (s.video) ctx.media.push({ kind: 'video', link: videoUrl(s.video) });

  const next = onboardingStep(audience, s.n + 1);
  return (
    `Give the user ${audience} step ${s.n} of ${track.steps.length} — "${s.title}":\n${s.body}\n\n` +
    (next
      ? `Then offer step ${next.n} ("${next.title}") — they can say "next".`
      : `That is the final step. Point them to the full guide: ${guideUrl(audience)}`)
  );
}

// ---- EstateCopilot: landlord feature guides ---------------------------

async function shareLandlordFeature(input: { feature?: string }, ctx: ToolContext): Promise<string> {
  const feature = findLandlordFeature(input.feature ?? '');
  if (!feature) return 'Could not match that to one feature — ask a short clarifying question, or use get_onboarding for the full landlord walkthrough.';
  const img = landlordFeatureImageUrl(feature);
  if (img) ctx.media.push({ kind: 'image', link: img, caption: feature.title });
  return `${feature.title}: ${feature.summary}\nFull guide section: ${landlordFeatureGuideUrl(feature)}`;
}

async function shareLandlordPaymentLink(): Promise<string> {
  const monthly = `₦${(env.subscription.monthlyAmountKobo / 100).toLocaleString('en-NG')}/month`;
  return (
    `Sign-up has two steps, in this order — paying first with no account on file leaves nothing for the team to activate. ` +
    `1) Create the account: estatecopilot.org → "List your property" → fill in name, email, WhatsApp number, password and state. ` +
    `2) Pay the flat ${monthly} (any number of properties, no extra charges) — the signup form takes them to a secure Paystack page automatically, or they can pay directly at ${env.subscription.hostedPageUrl} once the account exists. ` +
    'The account is NOT switched on automatically — during the pilot a real person checks every new landlord after payment clears, usually within a few hours, then the account goes live.'
  );
}

// ---- EstateCopilot: tenant feature guides -----------------------------

async function shareTenantFeature(input: { feature?: string }, ctx: ToolContext): Promise<string> {
  const feature = findTenantFeature(input.feature ?? '');
  if (!feature) return 'Could not match that to one feature — ask a short clarifying question, or use get_onboarding for the full tenant walkthrough.';
  const img = tenantFeatureImageUrl(feature);
  if (img) ctx.media.push({ kind: 'image', link: img, caption: feature.title });
  return `${feature.title}: ${feature.summary}\nFull guide section: ${tenantFeatureGuideUrl(feature)}`;
}

// ---- EstateCopilot: artisan feature guides ----------------------------

async function shareArtisanFeature(input: { feature?: string }, ctx: ToolContext): Promise<string> {
  const feature = findArtisanFeature(input.feature ?? '');
  if (!feature) return 'Could not match that to one feature — ask a short clarifying question, or use get_onboarding for the full artisan walkthrough.';
  const img = artisanFeatureImageUrl(feature);
  if (img) ctx.media.push({ kind: 'image', link: img, caption: feature.title });
  return `${feature.title}: ${feature.summary}\nFull guide section: ${artisanFeatureGuideUrl(feature)}`;
}

// ---- EstateCopilot: Kolo referral partner feature guides ---------------

async function sharePartnerFeature(input: { feature?: string }, ctx: ToolContext): Promise<string> {
  const feature = findPartnerFeature(input.feature ?? '');
  if (!feature) return 'Could not match that to one feature — ask a short clarifying question, or use get_onboarding for the full partner walkthrough.';
  const img = partnerFeatureImageUrl(feature);
  if (img) ctx.media.push({ kind: 'image', link: img, caption: feature.title });
  return `${feature.title}: ${feature.summary}\nFull guide section: ${partnerFeatureGuideUrl(feature)}`;
}

async function captureLead(
  input: { intent: string; name?: string; email?: string; details: string },
  ctx: ToolContext,
  brand: WaBrand,
): Promise<string> {
  const label = brandProfile(brand)?.label ?? 'EstateCopilot';
  await notifyOps(
    `${label} WhatsApp lead — ${input.intent}`,
    `From ${input.name ?? 'unknown'} (${ctx.from}${input.email ? `, ${input.email}` : ''}).\n\n${input.details}`,
  );
  return 'Lead captured. Tell the user the team will follow up on this WhatsApp number.';
}

// ---- AI Academy -----------------------------------------------------

async function getAcademyInfo(_input: { question?: string }): Promise<string> {
  const p = brandProfile('AI_ACADEMY')!;
  return `${p.faq}\n\nMore info: ${p.siteUrl}\n(Only state facts that appear above. For anything else, capture the enquiry.)`;
}

// One general link per stage of the conversation — everything is browsable
// content, no login required.
async function shareAcademyLink(input: { resource?: string }): Promise<string> {
  switch (input.resource) {
    case 'landing':
      return `AI Academy: ${ACADEMY_LANDING_URL}`;
    case 'learner_guide':
      return `Here's what learning at the Academy looks like: ${ACADEMY_LEARNER_GUIDE_URL}`;
    case 'catalogue':
      return `The full course catalogue: ${ACADEMY_CATALOGUE_URL}`;
    case 'payment':
      return (
        `Enrol and pay here: ${ACADEMY_PAYMENT_URL} — registration completes automatically as soon as ` +
        'payment is confirmed, no extra form needed.'
      );
    default:
      return `AI Academy: ${ACADEMY_LANDING_URL}`;
  }
}

async function shareAcademyCourse(input: { course?: string }): Promise<string> {
  const course = findAcademyCourse(input.course ?? '');
  if (!course) return `Couldn't match that to one course — share the full catalogue instead: ${ACADEMY_CATALOGUE_URL}`;
  return `${course.title}${course.free ? ' (free lesson)' : ''}: ${course.url}`;
}

// ---- AI Academy for Teens --------------------------------------------

async function shareTeensLink(input: { resource?: string }): Promise<string> {
  switch (input.resource) {
    case 'curriculum':
      return `AI Academy for Teens — the curriculum: ${TEENS_CURRICULUM_URL}`;
    case 'safety':
      return `Using AI Safely & Wisely — the mandatory first module: ${TEENS_SAFETY_URL}`;
    case 'sel':
      return `The Social-Emotional Learning course, which runs alongside the AI tracks: ${TEENS_SEL_URL}`;
    case 'payment':
      return (
        `Enrol and pay here: ${TEENS_PAYMENT_URL} — once payment is confirmed, your child is added to the ` +
        'Academy automatically, no extra form needed.'
      );
    default:
      return `AI Academy for Teens — the curriculum: ${TEENS_CURRICULUM_URL}`;
  }
}

async function shareTeensTrack(input: { track?: string }): Promise<string> {
  const track = findTeensTrack(input.track ?? '');
  if (!track) return `Couldn't match that to one track — share the curriculum page instead: ${TEENS_CURRICULUM_URL}`;
  return `${track.title}: ${track.url}`;
}

async function captureAcademyLead(
  input: {
    interest: string;
    programme?: string; // course title, or "teens" for an under-18 enquiry
    studentName?: string;
    parentName?: string;
    email?: string;
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
      input.programme ? `Course/programme: ${input.programme}` : null,
      input.studentName ? `Name: ${input.studentName}` : null,
      input.parentName ? `Parent/guardian (under-18 enquiry): ${input.parentName}` : null,
      input.email ? `Email: ${input.email}` : null,
      input.ageOrClass ? `Age/level: ${input.ageOrClass}` : null,
      input.location ? `Location: ${input.location}` : null,
      `Contact: ${ctx.from}${input.contactPreference ? ` (${input.contactPreference})` : ''}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return 'Enquiry captured. Tell the user the team will follow up on this WhatsApp number.';
}

// ---- shared -------------------------------------------------------

// Flags a conversation for a team member to review (financial/legal/complaint
// topics, or a brand-new UNKNOWN-brand message). This does NOT silence the
// agent — a customer must always get a reply. Only a human explicitly taking
// the conversation over from the ops console (takeoverConversation, a
// separate admin-gated action) sets it to HUMAN_ACTIVE and stops the agent.
async function escalateToHuman(input: { reason: string }, ctx: ToolContext, brand: WaBrand): Promise<string> {
  const label = brandProfile(brand)?.label ?? 'EstateCopilot/AI Academy';
  await notifyOps(
    `${label} WhatsApp — needs a human`,
    `Conversation with ${ctx.from} was flagged for review.\nReason: ${input.reason}`,
  );
  return (
    'Flagged for a team member to also review. Tell the user a person may follow up on this specific point, ' +
    'but keep helping them yourself right now with anything else they ask — never leave them without a reply.'
  );
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
    description: 'Log a viewing request for a listing. Does NOT confirm a time — ops does that. Needs visitor name and a preferred day/time; always ask for an email too so the team can follow up.',
    input_schema: {
      type: 'object',
      properties: {
        listingId: { type: 'string' },
        name: { type: 'string' },
        preferredTime: { type: 'string', description: 'Free text, e.g. "Saturday morning"' },
        email: { type: 'string', description: "The visitor's email, if they gave one" },
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
    description: 'Send a quote request to one artisan id from search_artisans. Needs requester name and a job description; always ask for an email too so the team can follow up.',
    input_schema: {
      type: 'object',
      properties: {
        artisanId: { type: 'string' },
        requesterName: { type: 'string' },
        description: { type: 'string' },
        email: { type: 'string', description: "The requester's email, if they gave one" },
      },
      required: ['artisanId', 'requesterName', 'description'],
    },
  },
];

const ONBOARDING_TOOL: ToolDef = {
  name: 'get_onboarding',
  description:
    'Walk a user through getting started, one step at a time. First decide which track fits them — landlord (owns property), tenant (renting, has an invite), artisan (tradesperson), or partner (Kolo referral programme) — and pass it as `audience`. Omit `step` for that track\'s overview; pass a step number for that step (its illustration, if any, is sent automatically). Call with no audience to get the list of tracks and their descriptions.',
  input_schema: {
    type: 'object',
    properties: {
      audience: { type: 'string', enum: ['landlord', 'tenant', 'artisan', 'partner'] },
      step: { type: 'number', description: '1-based step number; omit for the overview' },
    },
  },
};

const LANDLORD_FEATURE_TOOL: ToolDef = {
  name: 'share_landlord_feature',
  description:
    "Answer a landlord's \"how do I…\" question about a specific portal feature once they are past sign-up — the full explanation plus its real screenshot and a link to that section of the illustrated guide.",
  input_schema: {
    type: 'object',
    properties: {
      feature: {
        type: 'string',
        enum: LANDLORD_FEATURES.map((f) => f.title),
        description: 'The exact feature title that best matches what the landlord asked about.',
      },
    },
    required: ['feature'],
  },
};

const LANDLORD_PAYMENT_TOOL: ToolDef = {
  name: 'share_landlord_payment_link',
  description:
    'Share how a landlord signs up and pays when they are ready to list a property or ask how to pay — returns both the sign-up-first sequence and the payment link, since paying without an account first leaves nothing for the team to activate.',
  input_schema: { type: 'object', properties: {} },
};

const TENANT_FEATURE_TOOL: ToolDef = {
  name: 'share_tenant_feature',
  description:
    "Answer a tenant's \"how do I…\" question about a specific portal feature — messaging their landlord, reporting a repair, paying rent, signing their agreement — the full explanation plus its real screenshot and a link to that section of the illustrated guide.",
  input_schema: {
    type: 'object',
    properties: {
      feature: {
        type: 'string',
        enum: TENANT_FEATURES.map((f) => f.title),
        description: 'The exact feature title that best matches what the tenant asked about.',
      },
    },
    required: ['feature'],
  },
};

const ARTISAN_FEATURE_TOOL: ToolDef = {
  name: 'share_artisan_feature',
  description:
    "Answer an artisan's \"how do I…\" question about a specific part of the artisan portal — signing up, picking trades and coverage, getting verified, adding photos, winning jobs — the full explanation plus a link to that section of the illustrated guide.",
  input_schema: {
    type: 'object',
    properties: {
      feature: {
        type: 'string',
        enum: ARTISAN_FEATURES.map((f) => f.title),
        description: 'The exact feature title that best matches what the artisan asked about.',
      },
    },
    required: ['feature'],
  },
};

const PARTNER_FEATURE_TOOL: ToolDef = {
  name: 'share_partner_feature',
  description:
    "Answer a Kolo referral partner's \"how do I…\" question about a specific part of the partner portal — signing up, getting their referral link, sharing it, tracking signups and getting paid — the full explanation plus a link to that section of the illustrated guide.",
  input_schema: {
    type: 'object',
    properties: {
      feature: {
        type: 'string',
        enum: PARTNER_FEATURES.map((f) => f.title),
        description: 'The exact feature title that best matches what the partner asked about.',
      },
    },
    required: ['feature'],
  },
};

const CAPTURE_LEAD_TOOL: ToolDef = {
  name: 'capture_lead',
  description: 'Record a lead for the team: when no other tool fits (e.g. a landlord wanting to list, a request with no match), OR simply to log an email address someone gave you after a normal, already-resolved enquiry so the team can follow up. Always ask for an email so the team can follow up.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'Short label, e.g. "landlord wants to list", "rental enquiry no match"' },
      name: { type: 'string' },
      email: { type: 'string', description: "The person's email, if they gave one" },
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
    name: 'share_academy_link',
    description:
      "Share one of the AI Academy's general links: the landing page for a general first look, the learner guide for what learners will learn, the full catalogue to browse every course, or the payment link when someone is ready to enrol.",
    input_schema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          enum: ['landing', 'learner_guide', 'catalogue', 'payment'],
          description:
            '"landing" for a general enquiry, "learner_guide" for what they will learn, "catalogue" to browse everything, "payment" when ready to enrol.',
        },
      },
      required: ['resource'],
    },
  },
  {
    name: 'share_academy_course',
    description: 'Share the link for ONE specific AI Academy course or track the user asked about.',
    input_schema: {
      type: 'object',
      properties: {
        course: {
          type: 'string',
          enum: ACADEMY_COURSES.map((c) => c.title),
          description: 'The exact course title that best matches what the user asked about.',
        },
      },
      required: ['course'],
    },
  },
  {
    name: 'share_teens_link',
    description:
      "Share one of the AI Academy for Teens' general links: the curriculum hub, the mandatory safety module, the Social-Emotional Learning (SEL) course, or the payment link.",
    input_schema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          enum: ['curriculum', 'safety', 'sel', 'payment'],
          description:
            '"curriculum" for a general first look at the teens programme, "safety" for the mandatory first module, "sel" for the wellbeing/social-emotional-learning course, "payment" when the parent/guardian is ready to enrol.',
        },
      },
      required: ['resource'],
    },
  },
  {
    name: 'share_teens_track',
    description: 'Share the link for ONE specific AI Academy for Teens track the user asked about.',
    input_schema: {
      type: 'object',
      properties: {
        track: {
          type: 'string',
          enum: TEENS_TRACKS.map((t) => t.title),
          description: 'The exact track title that best matches what the user asked about.',
        },
      },
      required: ['track'],
    },
  },
  {
    name: 'capture_academy_lead',
    description: 'Record an AI Academy enquiry for a human to follow up on: when not ready to pay, a question the facts/tools cannot resolve, OR simply to log an email address someone gave you after a normal, already-resolved enquiry. Always ask for an email so the team can follow up.',
    input_schema: {
      type: 'object',
      properties: {
        interest: { type: 'string', description: 'What they asked about / want' },
        programme: { type: 'string', description: 'The course/track they are interested in, if any, by its title' },
        studentName: { type: 'string' },
        parentName: { type: 'string', description: 'Only for an enquiry on behalf of a school-age child/teenager' },
        email: { type: 'string', description: "The person's (parent's, for a teens enquiry) email, if they gave one" },
        ageOrClass: { type: 'string', description: 'Age, or level/role (student, professional, business)' },
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
    'Flag the conversation for a team member to also review. Use for anything financial, legal or contractual, complaints, or when brand is not yet known. This does not hand off the whole conversation — keep answering the user\'s other questions normally afterward.',
  input_schema: {
    type: 'object',
    properties: { reason: { type: 'string' } },
    required: ['reason'],
  },
};

export function toolsForBrand(brand: WaBrand): ToolDef[] {
  if (brand === 'ESTATECOPILOT') {
    return [
      ...LISTING_TOOLS,
      ...ARTISAN_TOOLS,
      ONBOARDING_TOOL,
      LANDLORD_FEATURE_TOOL,
      LANDLORD_PAYMENT_TOOL,
      TENANT_FEATURE_TOOL,
      ARTISAN_FEATURE_TOOL,
      PARTNER_FEATURE_TOOL,
      CAPTURE_LEAD_TOOL,
      ESCALATE_TOOL,
    ];
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
      case 'get_onboarding':
        return await getOnboarding(input as any, ctx);
      case 'share_landlord_feature':
        return await shareLandlordFeature(input as any, ctx);
      case 'share_landlord_payment_link':
        return await shareLandlordPaymentLink();
      case 'share_tenant_feature':
        return await shareTenantFeature(input as any, ctx);
      case 'share_artisan_feature':
        return await shareArtisanFeature(input as any, ctx);
      case 'share_partner_feature':
        return await sharePartnerFeature(input as any, ctx);
      case 'capture_lead':
        return await captureLead(input as any, ctx, brand);
      case 'get_academy_info':
        return await getAcademyInfo(input as any);
      case 'share_academy_link':
        return await shareAcademyLink(input as any);
      case 'share_academy_course':
        return await shareAcademyCourse(input as any);
      case 'share_teens_link':
        return await shareTeensLink(input as any);
      case 'share_teens_track':
        return await shareTeensTrack(input as any);
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
