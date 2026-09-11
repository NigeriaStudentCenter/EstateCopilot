// Feature-level "how do I…" guides the marketing agent can share once
// someone is past the initial sign-up (that's onboarding.ts's job) and
// asking how to actually use a specific part of the portal. Each entry
// points at a real, live section of the existing illustrated guides
// (marketing/public/guides/) — not new pages — with a real screenshot the
// agent attaches alongside its reply.
//
// One array per EstateCopilot audience: landlord, tenant, artisan, and
// Kolo (referral) partner.

import { imageUrl, mediaBase } from './onboarding.js';

export interface FeatureGuide {
  /** Exact title surfaced to the model as a tool enum value. */
  title: string;
  /** What the agent should tell the user, in its own words, from this fact — kept short and accurate. */
  summary: string;
  /** Path (with #anchor) under marketing/public/guides/. */
  guidePath: string;
  /** Filename under /guides/images/ — omit if the section has no single representative shot. */
  image?: string;
}

const guideUrl = (path: string) => `${mediaBase()}/guides/${path}`;

export const LANDLORD_FEATURES: FeatureGuide[] = [
  {
    title: 'Signing up and getting approved',
    summary:
      'Sign up at estatecopilot.org ("List your property"), pay the flat ₦10,000/month fee, then wait for the team to switch the account on — usually within a few hours, since a real person checks every new landlord during the pilot.',
    guidePath: 'landlord-guide.html#part1',
    image: 'landlord-02-signup-form.webp',
  },
  {
    title: 'The dashboard and sidebar menu',
    summary:
      'Everything lives in the left sidebar: Dashboard, Properties, Tenancies, Tenant Vetting, Finance & Levies, Maintenance, Legal, Bookings, AI Inbox, Settings. The Dashboard itself is a quick summary — revenue, active tenancies, pending repairs, arrears.',
    guidePath: 'landlord-guide.html#part2',
    image: 'landlord-05-sidebar-dashboard.webp',
  },
  {
    title: 'Replying to tenants with the AI Inbox',
    summary:
      'A tenant message shows up on Tenancies instantly, and a reply is drafted for the landlord in their own voice in the AI Inbox. Nothing sends automatically — the landlord reads it, can edit it, then taps Approve & send, or Reject.',
    guidePath: 'landlord-guide.html#part3',
    image: 'landlord-16-ai-inbox-list.webp',
  },
  {
    title: 'Sending a rent reminder',
    summary: 'Open Tenancies, pick a tenant, tap "Send rent reminder" — it goes out over WhatsApp immediately and is logged in that tenant\'s message history.',
    guidePath: 'landlord-guide.html#part3',
    image: 'landlord-08-tenancies.webp',
  },
  {
    title: 'Adding a property',
    summary:
      'Properties → Add property. Fill in title, address, LGA, type (long-term or short-let), rent amount and caution deposit, plus an optional Tenement/Municipal ID for tracking local levies.',
    guidePath: 'landlord-guide.html#part4',
    image: 'landlord-10-add-property-form.webp',
  },
  {
    title: 'Advertising a vacant unit',
    summary:
      'Add photos and a short honest description, then switch on "Advertise on public site" — the unit appears on EstateCopilot\'s public listings page and anyone can request a viewing.',
    guidePath: 'vacancies-repairs-guide.html#vacancies',
    image: 'landlord-12-advertise-toggle.webp',
  },
  {
    title: 'Inviting a tenant',
    summary:
      'On the property card, "Invite a tenant" — enter their name and WhatsApp number, tap Generate link, then send that link to them (with the Tenant Guide) — that\'s how they create their own account.',
    guidePath: 'landlord-guide.html#part4',
    image: 'landlord-13-invite-tenant.webp',
  },
  {
    title: 'Connecting a bank account',
    summary:
      'Settings → enter account number and bank. It\'s verified instantly, and every rent payment from then on pays the landlord directly — the money never sits with EstateCopilot.',
    guidePath: 'landlord-guide.html#part4',
    image: 'landlord-14-settings-bank.webp',
  },
  {
    title: 'Collecting rent with Paystack links',
    summary:
      'On a tenant\'s page, choose "Pay in full" or "Installments" and generate Paystack payment link(s) — the tenant pays through those, and it lands straight in the landlord\'s own connected bank account.',
    guidePath: 'landlord-guide.html#part5',
    image: 'landlord-09-payment-plan.webp',
  },
  {
    title: 'Tracking levies (Tenement Rate, LAWMA)',
    summary:
      'Finance & Levies — log each property\'s local levies and mark them cleared once paid. A caution deposit can\'t be released to a tenant while a levy on that property is in arrears, which protects the landlord automatically.',
    guidePath: 'landlord-guide.html#part5',
    image: 'landlord-15-finance-levies.webp',
  },
  {
    title: 'Handling a repair report',
    summary:
      'A tenant\'s repair report appears in Maintenance with a status and responsibility badge. The landlord can dispatch it to a verified artisan from the platform, or list it on the public handymen marketplace for quotes.',
    guidePath: 'vacancies-repairs-guide.html#repairs',
    image: 'repairs-01-landlord-list.webp',
  },
  {
    title: 'Confirming viewing and visit requests',
    summary: 'Bookings lists every property-viewing and repair-visit request, grouped by date — tap Confirm or Cancel on each.',
    guidePath: 'landlord-guide.html#part5',
    image: 'bookings-01-viewing-request.webp',
  },
  {
    title: 'Getting legal help',
    summary: 'Legal — describe a difficult situation (a tricky tenant, a notice-to-quit) and a real lawyer can quote for the work.',
    guidePath: 'landlord-guide.html#part5',
  },
  {
    title: 'Vetting a tenant before you trust them',
    summary: 'Tenant Vetting — check a prospective tenant\'s identity (BVN) before agreeing to let to them.',
    guidePath: 'landlord-guide.html#part2',
  },
];

export const TENANT_FEATURES: FeatureGuide[] = [
  {
    title: 'Accepting your invite and signing up',
    summary:
      'The invite link from your landlord pre-fills your Tenancy ID — you just add your full name (as on the tenancy agreement), an email you check, and a password of at least 8 characters. You only need the link once; after that, log in at tenant.estatecopilot.org.',
    guidePath: 'tenant-guide.html#part1',
    image: 'tenant-02-signup-filled.webp',
  },
  {
    title: 'Your Overview page',
    summary:
      'Your home screen: lease status, renewal date, yearly rent, electricity balance, and — when something is due — a "Next payment due" banner with a Pay now button.',
    guidePath: 'tenant-guide.html#part2',
    image: 'tenant-04-overview.webp',
  },
  {
    title: 'Messaging your landlord',
    summary:
      'Correspondence shows every conversation with your landlord, including WhatsApp reminders. Type in the box and tap Send — your landlord reviews each reply before it reaches you, so a response can take a little while.',
    guidePath: 'tenant-guide.html#part3',
    image: 'tenant-05-correspondence.webp',
  },
  {
    title: 'Reporting a repair',
    summary:
      'Open Maintenance, tick the checklist item closest to your issue — it instantly shows whether it is "🏠 Landlord\'s responsibility" (plumbing, wiring, the roof) or "🔧 Your responsibility" (day-to-day upkeep), or tick "Something else / not sure" — then add a short description and tap Report issue. It appears in a list below with a status badge that moves OPEN → DISPATCHED → AWAITING TENANT SIGNOFF → RESOLVED as your landlord works on it.',
    guidePath: 'vacancies-repairs-guide.html#r-report',
    image: 'tenant-07-maintenance-reported.webp',
  },
  {
    title: 'Paying your rent',
    summary:
      'On your Overview page, tap "Pay now via Paystack" in the amber box. Pay by card or bank transfer — the money goes straight to your landlord\'s own bank account, never to EstateCopilot. Never pay rent any other way; if someone asks you to, check with your landlord first.',
    guidePath: 'tenant-guide.html#part4',
    image: 'tenant-04-overview.webp',
  },
  {
    title: 'Signing your tenancy agreement',
    summary:
      'When your landlord sends it, open the Agreement tab and read it fully. At the bottom, type your full legal name, tick "I have read and agree...", then tap Sign agreement — your signature and the date are saved automatically.',
    guidePath: 'tenant-guide.html#part4',
    image: 'tenant-09-agreement-signed.webp',
  },
];

export const ARTISAN_FEATURES: FeatureGuide[] = [
  {
    title: 'Creating your account',
    summary:
      'Go to artisans.estatecopilot.org, or tap "Join as an artisan" in the website footer. No invite needed — sign up independently any time. Enter your phone number, confirm the 6-digit code sent to you (that code logs you in every time — no password), then add your name, state and base LGA.',
    guidePath: 'artisan-guide.html#part1',
  },
  {
    title: 'Picking your trades and coverage area',
    summary:
      'Choose up to six trades (Electrician, Plumber, Tiler, AC Technician, Generator Technician, Carpenter, Painter, Welder, Borehole, POP & Ceiling, and more), set years of experience for each, and mark one as your primary trade. Your base LGA is always covered — add every other LGA you\'ll travel to, since jobs are matched to artisans who cover that area.',
    guidePath: 'artisan-guide.html#part2',
  },
  {
    title: 'Getting verified',
    summary:
      'You will not appear in the public directory until you pass at least an ID check. Enter your NIN or BVN on your profile — it is checked against the national database to confirm your name only, the number itself is never stored or shown. A pass moves you to ID-verified and switches your profile live. Higher tiers (reference-checked, then EstateCopilot-certified) come later and help you stand out further.',
    guidePath: 'artisan-guide.html#part3',
  },
  {
    title: 'Adding work photos and availability',
    summary:
      'Upload clear photos of finished jobs — a neat DB board, a tiled bathroom, a fitted wardrobe. The first photo becomes your directory cover and is the single biggest thing that wins a call. Keep your status set to Open, Busy or Away honestly, since landlords and tenants see it.',
    guidePath: 'artisan-guide.html#part4',
  },
  {
    title: 'Winning jobs',
    summary:
      'When someone picks you from the directory, their request appears under Direct requests with their phone number — call back quickly, speed wins these. The Jobs tab lists repair jobs in your coverage area; send a price, or ask to visit first if you need to see it to quote accurately. Finished jobs get rated, and ratings feed your score, which decides how high you rank next time someone searches your trade. Direct hires are agreed and paid between you and the client — EstateCopilot takes no cut.',
    guidePath: 'artisan-guide.html#part5',
  },
];

export const PARTNER_FEATURES: FeatureGuide[] = [
  {
    title: 'Creating your partner account',
    summary:
      'Use the "Refer & earn" link in the EstateCopilot website footer, or a partner-portal link a team member sent you. Enter your phone number and the one-time code you receive — there\'s no password. Add your name; you can add your bank account under Wallet later, once you\'re ready to be paid.',
    guidePath: 'referral-guide.html#part1',
  },
  {
    title: 'Getting your referral link',
    summary:
      'Open the Links tab — your link looks like estatecopilot.org/?ref=YOURCODE. Share the plain link, or point it at a specific page (like the sign-up page); both still carry your code. A click is credited to you for 30 days, even if the landlord signs up later, including after clicking away to pay.',
    guidePath: 'referral-guide.html#part2',
  },
  {
    title: 'Sharing it the right way',
    summary:
      'Send it with a short, honest pitch — landlords respond to clarity, not hype. Good places: your WhatsApp status, landlord groups you\'re part of, a pinned message in a building\'s owners chat, your email signature, one-to-one with clients. Don\'t spam groups you\'re not part of, don\'t sign people up on their behalf — referrals that look like abuse can be reversed.',
    guidePath: 'referral-guide.html#part3',
  },
  {
    title: 'Tracking signups and getting paid',
    summary:
      'Home shows clicks and signups. Wallet shows what you\'ve earned — each confirmed landlord shows as a commission, payable once their subscription payment clears. Add your bank account under Wallet to be paid on a regular cycle; a 5% withholding tax (as required in Nigeria) is deducted and remitted on your behalf, and Wallet shows the gross amount, the deduction, and what lands in your account.',
    guidePath: 'referral-guide.html#part4',
  },
];

export function findLandlordFeature(title: string): FeatureGuide | undefined {
  return LANDLORD_FEATURES.find((f) => f.title === title);
}

export function landlordFeatureImageUrl(f: FeatureGuide): string | undefined {
  return f.image ? imageUrl(f.image) : undefined;
}

export function landlordFeatureGuideUrl(f: FeatureGuide): string {
  return guideUrl(f.guidePath);
}

export function findTenantFeature(title: string): FeatureGuide | undefined {
  return TENANT_FEATURES.find((f) => f.title === title);
}

export function tenantFeatureImageUrl(f: FeatureGuide): string | undefined {
  return f.image ? imageUrl(f.image) : undefined;
}

export function tenantFeatureGuideUrl(f: FeatureGuide): string {
  return guideUrl(f.guidePath);
}

export function findArtisanFeature(title: string): FeatureGuide | undefined {
  return ARTISAN_FEATURES.find((f) => f.title === title);
}

export function artisanFeatureImageUrl(f: FeatureGuide): string | undefined {
  return f.image ? imageUrl(f.image) : undefined;
}

export function artisanFeatureGuideUrl(f: FeatureGuide): string {
  return guideUrl(f.guidePath);
}

export function findPartnerFeature(title: string): FeatureGuide | undefined {
  return PARTNER_FEATURES.find((f) => f.title === title);
}

export function partnerFeatureImageUrl(f: FeatureGuide): string | undefined {
  return f.image ? imageUrl(f.image) : undefined;
}

export function partnerFeatureGuideUrl(f: FeatureGuide): string {
  return guideUrl(f.guidePath);
}
