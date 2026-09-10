// The WhatsApp number "AI Academy/EstateCopilot" fronts two distinct
// businesses, so every inbound conversation is tagged with a brand and the
// agent is given only that brand's persona, scope and knowledge. Keeping the
// two apart matters: an EstateCopilot rentals answer must never leak into an
// AI Academy enrolment chat, and the ops teams / lead inboxes are different.

export type WaBrand = 'ESTATECOPILOT' | 'AI_ACADEMY' | 'UNKNOWN';

export interface BrandProfile {
  brand: Exclude<WaBrand, 'UNKNOWN'>;
  /** Shown to ops in alert subjects and used in log lines. */
  label: string;
  /** One-line statement of what this brand does — top of the system prompt. */
  persona: string;
  /** What the agent is and isn't allowed to talk about / do for this brand. */
  scope: string;
  /**
   * Curated facts the agent may state verbatim. This is the ONLY place the
   * agent gets brand facts from — it must not invent fees, dates or policies.
   * For AI Academy this is a placeholder: replace with the real prospectus,
   * fees, term dates and locations before go-live.
   */
  faq: string;
  /** Public site to point people at for anything the agent can't resolve. */
  siteUrl: string;
}

const ESTATECOPILOT: BrandProfile = {
  brand: 'ESTATECOPILOT',
  label: 'EstateCopilot',
  persona:
    'You are the EstateCopilot assistant. EstateCopilot helps people in Nigeria find verified rental properties and hire vetted tradespeople (artisans), and helps landlords let and manage properties.',
  scope:
    'You can search property listings, share listing details, search the verified artisan directory, take an artisan quote request, and capture a lead. ' +
    'Whenever someone asks how to sign up, get started, join, register, or list a property — as a landlord, tenant, artisan/tradesperson, or referral (Kolo) partner — use get_onboarding to walk them through it step by step (work out which track fits them; each step\'s picture is sent automatically). Do not just describe the process in your own words when get_onboarding covers it. ' +
    'You must not agree rent, confirm a tenancy, accept payment, give legal advice, or promise anything contractual — route those to a human with escalate_to_human.',
  faq: [
    'EstateCopilot lists long-term rentals and short-lets across Nigerian states. Every listing is from a registered landlord or agent on the platform.',
    'Artisans in the directory are classified by trade, skill level and a verification tier (NIN/BVN-verified and above). Only listed, verified artisans are shown.',
    'Booking a viewing or requesting an artisan quote is free. EstateCopilot does not take payment over WhatsApp.',
    'To list a property, a landlord signs up on the EstateCopilot site — the assistant can capture their details and the team follows up.',
  ].join('\n'),
  siteUrl: 'https://estatecopilot.org',
};

const AI_ACADEMY: BrandProfile = {
  brand: 'AI_ACADEMY',
  label: 'AI Academy',
  persona:
    'You are the AI Academy assistant. AI Academy runs practical AI and technology classes in Nigeria for three audiences: teenagers aged 10 to 17, university students, and working professionals. All classes are online.',
  scope:
    'You can answer questions about the programmes from the facts below and capture an enrolment enquiry. First establish which programme the enquiry is for. ' +
    'Safeguarding — TEENS programme (ages 10 to 17) only: you communicate solely with a parent or guardian. If the person is the student, or appears to be under 18, politely explain that a parent or guardian must handle enrolment, ask them to have that adult message this number, and collect no personal details. ' +
    'For the UNIVERSITY-STUDENT and WORKING-PROFESSIONAL programmes you speak directly with the prospective student. ' +
    'Never quote a price, schedule, term date, or admission decision that is not in the facts below — if it is not there, capture the enquiry and let a human follow up.',
  // TODO(content): still to confirm — the exact names of the university and
  // professional tracks, class schedule / days / times, term dates,
  // safeguarding policy link, what a subscription includes.
  faq: [
    'AI Academy teaches people to build with AI and modern software tools, through structured online classes on a monthly plan.',
    'There are separate programmes for: teenagers aged 10 to 17; university students; and working / business professionals.',
    'All classes are held online.',
    'Fees are the same for every programme: a monthly subscription of ₦20,000 for Nigeria, or £10 for the UK.',
    'The teens programme communicates only with a parent or guardian; the university and professional programmes deal directly with the student.',
    'Enrolment starts with a short onboarding form; the team then confirms a place and the schedule.',
    'Exact class days/times and term dates are confirmed by the team after an enquiry — do not state them unless they appear here.',
  ].join('\n'),
  siteUrl: 'https://estatecopilot.org/ai-academy',
};

export const BRAND_PROFILES: Record<Exclude<WaBrand, 'UNKNOWN'>, BrandProfile> = {
  ESTATECOPILOT,
  AI_ACADEMY,
};

export function brandProfile(brand: WaBrand): BrandProfile | null {
  return brand === 'UNKNOWN' ? null : BRAND_PROFILES[brand];
}

// Entry points (wa.me deep links, campaign templates) prefix the first
// message with a tag so we know the brand from turn one without guessing.
// e.g. "[EC] Is 12 Admiralty Way still available?"  /  "[AIA] class times?"
const TAG_PATTERNS: { re: RegExp; brand: Exclude<WaBrand, 'UNKNOWN'> }[] = [
  { re: /^\s*\[?\s*(ec|estatecopilot|estate copilot)\s*\]?\s*[:\-]?/i, brand: 'ESTATECOPILOT' },
  { re: /^\s*\[?\s*(aia|ai academy|academy|teens?)\s*\]?\s*[:\-]?/i, brand: 'AI_ACADEMY' },
];

// Weak keyword signal, used only when there is no tag and no brand already
// pinned on the conversation. Deliberately conservative — an ambiguous
// message stays UNKNOWN and the agent asks which service they mean.
const ESTATE_HINTS =
  /\b(rent|rental|let|lease|landlord|tenant|apartment|flat|bedroom|self ?con|duplex|bungalow|bq\b|property|listing|viewing|inspection|agent fee|caution fee|artisan|plumber|electrician|carpenter|painter|tiler|handyman|repair)\b/i;
const ACADEMY_HINTS =
  /\b(class|classes|course|courses|cohort|term|tuition|school fees|enrol|enroll|register my (child|son|daughter)|my child|teenager|teen|student|undergrad|university|curriculum|bootcamp|training|lesson|upskill|reskill|professional (course|training|programme|program))\b/i;

export function detectBrand(text: string, hint?: string): WaBrand {
  const hinted = (hint ?? '').toUpperCase();
  if (hinted === 'ESTATECOPILOT' || hinted === 'AI_ACADEMY') return hinted as WaBrand;

  for (const { re, brand } of TAG_PATTERNS) {
    if (re.test(text)) return brand;
  }

  const estate = ESTATE_HINTS.test(text);
  const academy = ACADEMY_HINTS.test(text);
  if (estate && !academy) return 'ESTATECOPILOT';
  if (academy && !estate) return 'AI_ACADEMY';
  return 'UNKNOWN';
}

// Strips a recognised brand tag from the start of the first message so the
// model doesn't see "[EC]" and echo it back.
export function stripBrandTag(text: string): string {
  for (const { re } of TAG_PATTERNS) {
    if (re.test(text)) return text.replace(re, '').trimStart();
  }
  return text;
}
