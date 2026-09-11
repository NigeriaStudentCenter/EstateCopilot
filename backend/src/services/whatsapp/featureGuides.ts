// Feature-level "how do I…" guides the marketing agent can share once
// someone is past the initial sign-up (that's onboarding.ts's job) and
// asking how to actually use a specific part of the portal. Each entry
// points at a real, live section of the existing illustrated guides
// (marketing/public/guides/) — not new pages — with a real screenshot the
// agent attaches alongside its reply.
//
// One array per EstateCopilot audience: landlord today; tenant, artisan and
// Kolo partner follow the same shape.

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

export function findLandlordFeature(title: string): FeatureGuide | undefined {
  return LANDLORD_FEATURES.find((f) => f.title === title);
}

export function landlordFeatureImageUrl(f: FeatureGuide): string | undefined {
  return f.image ? imageUrl(f.image) : undefined;
}

export function landlordFeatureGuideUrl(f: FeatureGuide): string {
  return guideUrl(f.guidePath);
}
