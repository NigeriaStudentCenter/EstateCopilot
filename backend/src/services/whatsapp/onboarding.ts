// Onboarding walkthroughs the agent can deliver on WhatsApp, one small step
// at a time, for each kind of user:
//
//   landlord  — list & manage properties, get rent paid to your bank
//   tenant    — accept an invite, message the landlord, pay rent
//   artisan   — get listed in the verified directory, win jobs
//   partner   — the Kolo referral programme: refer landlords, earn monthly
//
// Copy and illustrations are the same assets as the public illustrated
// guides (marketing/public/guides/). The agent categorises which track a
// user needs from the conversation, then serves steps in order.

export type OnboardingAudience = 'landlord' | 'tenant' | 'artisan' | 'partner';

export interface OnboardingStep {
  n: number;
  title: string;
  /** WhatsApp-length copy — a few sentences, no markdown. */
  body: string;
  /** Filename under /guides/images/ on the marketing site. */
  image?: string;
  /** Filename under /videos/ on the marketing site. */
  video?: string;
}

interface OnboardingTrack {
  label: string;
  /** One line the agent uses to decide if this is the right track. */
  who: string;
  guideFile: string;
  steps: OnboardingStep[];
}

export function mediaBase(): string {
  return (process.env.WA_ONBOARDING_MEDIA_BASE ?? 'https://estatecopilot.org').replace(/\/$/, '');
}
export const imageUrl = (file: string) => `${mediaBase()}/guides/images/${file}`;
export const videoUrl = (file: string) => `${mediaBase()}/videos/${file}`;
export const guideUrl = (audience: OnboardingAudience) => `${mediaBase()}/guides/${ONBOARDING[audience].guideFile}`;

// ---- landlord --------------------------------------------------------

const LANDLORD: OnboardingStep[] = [
  {
    n: 1,
    title: 'What you get, and the cost',
    body:
      'EstateCopilot gives you a dashboard to manage your properties and tenants, WhatsApp help drafting replies to tenants (nothing is sent without your OK), and rent paid straight into your own bank account. It costs a flat ₦10,000 per month — any number of properties, no extra charges.',
    image: 'landlord-01-homepage.webp',
    video: 'walkthrough.mp4',
  },
  {
    n: 2,
    title: 'Sign up',
    body:
      'Open estatecopilot.org and tap the green "List your property" button. Enter your name, email, a phone number you check every day, a password, and your state. Then tap "Continue to payment".',
    image: 'landlord-02-signup-form.webp',
  },
  {
    n: 3,
    title: 'Pay the monthly fee',
    body:
      'You are taken to a secure Paystack page — the same kind banks and big shops in Nigeria use. Pay the ₦10,000 monthly fee there.',
    image: 'landlord-03-pay.webp',
  },
  {
    n: 4,
    title: 'Wait for your account to be switched on',
    body:
      'Once your payment clears, our team switches your account on — usually within a few hours. During the pilot a real person checks every new landlord. You will know it is ready when you can log in without a "payment pending" message.',
    image: 'landlord-04-login.webp',
  },
  {
    n: 5,
    title: 'Log in for the first time',
    body:
      'Go to landlord.estatecopilot.org, enter the email and password you chose, and tap "Log in". You land on your Dashboard. Everything lives in the menu down the left side.',
    image: 'landlord-05-sidebar-dashboard.webp',
  },
  {
    n: 6,
    title: 'Replying to tenants',
    body:
      'When a tenant messages you, it appears on your Tenancies page and your copilot writes a suggested reply in your voice in the "AI Inbox". Nothing is sent to a tenant until you read it and approve it. You can also open Tenancies and tap "Send rent reminder" any time.',
    image: 'landlord-08-tenancies.webp',
  },
  {
    n: 7,
    title: 'Add your first property',
    body:
      'Click "Properties", then "Add property". Fill in the address, state, LGA, property type, yearly rent and caution deposit.',
    image: 'landlord-10-add-property-form.webp',
  },
  {
    n: 8,
    title: 'Add photos and a description',
    body:
      'Paste in image links and write a short, honest description. Good photos matter a lot if you plan to advertise the unit.',
    image: 'landlord-11-property-photos.webp',
  },
  {
    n: 9,
    title: 'Advertise it, or invite your tenant',
    body:
      'Vacant unit? Turn on "Advertise on public site" and it appears on the public listings page for anyone to request a viewing. Tenant already moving in? Use "Invite a tenant" on the property card, enter their name and WhatsApp number, tap "Generate link" and send them the link — that is how they create their account.',
    image: 'landlord-13-invite-tenant.webp',
  },
  {
    n: 10,
    title: 'Connect your bank account',
    body:
      'Go to Settings and enter your account number and bank. We verify it instantly. From then on every rent payment pays you directly — the money never sits with EstateCopilot.',
    image: 'landlord-14-settings-bank.webp',
  },
  {
    n: 11,
    title: 'Getting paid and weekly tasks',
    body:
      'On a tenant\'s page choose "Pay in full" or "Installments" and generate Paystack links for them. Check "Finance & Levies" for every confirmed payment, and log local levies (Tenement Rate, LAWMA) there too. Repairs a tenant reports show under "Maintenance"; viewing and visit requests show under "Bookings".',
    image: 'landlord-15-finance-levies.webp',
  },
];

// ---- tenant ---------------------------------------------------------

const TENANT: OnboardingStep[] = [
  {
    n: 1,
    title: 'Open the invite link',
    body:
      'Your landlord sent you a link, usually over WhatsApp or SMS. It looks like tenant.estatecopilot.org/?code=xxxxxx . Tap it, or paste it into your phone browser.',
    image: 'tenant-whatsapp-invite-illustration.webp',
  },
  {
    n: 2,
    title: 'Create your account',
    body:
      'Stay on the "Create account" tab — your invite code is already filled in. Enter your full name (as on your tenancy agreement), an email you check, and a password of at least 8 characters. Tap "Create account".',
    image: 'tenant-02-signup-filled.webp',
  },
  {
    n: 3,
    title: 'Logging in next time',
    body:
      'You only need the invite link once. After that, go to tenant.estatecopilot.org, tap the "Log in" tab, and enter your email and password.',
    image: 'tenant-03-nav.webp',
  },
  {
    n: 4,
    title: 'Your Overview page',
    body:
      'This is your home screen: your lease status, renewal date, yearly rent, electricity balance, and — when something is due — a "Next payment due" box with a button to pay it.',
    image: 'tenant-04-overview.webp',
  },
  {
    n: 5,
    title: 'Messaging your landlord',
    body:
      'Open the "Correspondence" tab to see every conversation with your landlord, including WhatsApp reminders. Type in the box at the bottom and tap Send. Your landlord checks each reply before it reaches you, so a response can take a little while.',
    image: 'tenant-05-correspondence.webp',
  },
  {
    n: 6,
    title: 'Reporting a repair',
    body:
      'Something broken or leaking? Open the "Maintenance" tab and describe it — it goes straight to your landlord. Add a photo if you can.',
  },
  {
    n: 7,
    title: 'Paying your rent',
    body:
      'On the Overview page, tap "Pay now via Paystack" in the amber box. Pay by card or bank transfer — the money goes straight to your landlord. Never pay rent by any other method; if someone asks you to, check with your landlord first.',
    image: 'tenant-04-overview.webp',
  },
  {
    n: 8,
    title: 'Your tenancy agreement',
    body:
      'When your landlord sends it, open the "Agreement" tab and read it fully. At the bottom, type your full legal name, tick "I have read and agree...", then tap "Sign agreement". Your signature and the date are saved automatically.',
    image: 'tenant-09-agreement-signed.webp',
  },
];

// ---- artisan ------------------------------------------------------

const ARTISAN: OnboardingStep[] = [
  {
    n: 1,
    title: 'Open the artisan portal',
    body:
      'Go to artisans.estatecopilot.org on your phone, or tap "Join as an artisan" in the EstateCopilot website footer.',
  },
  {
    n: 2,
    title: 'Sign in with your phone number',
    body:
      'Enter your mobile number and the one-time code you receive by SMS. That code is how you log in every time — there is no password.',
  },
  {
    n: 3,
    title: 'Your name and base location',
    body:
      'First time in, set your name, your state, and the LGA you are based in. You can add a business name and a short bio from your profile afterwards.',
  },
  {
    n: 4,
    title: 'Your trades and coverage area',
    body:
      'Pick up to six trades (Electrician, Plumber, Tiler, AC Technician, Generator Technician, Carpenter, Painter, Welder, Borehole, POP & Ceiling, and more), set years of experience for each, and mark one as your primary trade. Then add every LGA you are willing to travel to — jobs are matched to artisans who cover that area, so wider coverage means more work.',
  },
  {
    n: 5,
    title: 'Get verified — this is what lists you',
    body:
      'You will not appear in the public directory until you pass at least an ID check. On your profile, enter your NIN or BVN. It is checked against the national database to confirm your name only — the number itself is never stored or shown. A pass moves you to ID-verified and switches your profile live.',
  },
  {
    n: 6,
    title: 'Work photos and availability',
    body:
      'Upload clear photos of finished jobs — a neat DB board, a tiled bathroom, a fitted wardrobe. The first photo becomes your directory cover, and it is the single biggest thing that wins a call. Keep your status set to Open, Busy or Away honestly.',
  },
  {
    n: 7,
    title: 'Winning jobs',
    body:
      'When someone picks you from the directory, their request appears under "Direct requests" with their phone number — call back quickly. The "Jobs" tab lists repair jobs in your coverage area; send a price, or ask to visit first. Finished jobs get rated, and ratings feed your score, which decides how high you rank next time.',
  },
];

// ---- partner (Kolo referral programme) --------------------------

const PARTNER: OnboardingStep[] = [
  {
    n: 1,
    title: 'What the programme is',
    body:
      'Refer landlords to EstateCopilot and earn a share of their subscription every month for their first year — not just once. It runs on Kolo, our partner platform, and it is free to join. Your exact rate is shown on your dashboard once you join.',
  },
  {
    n: 2,
    title: 'Open the partner portal',
    body:
      'Use the "Refer & earn" link in the EstateCopilot website footer, or a partner-portal link an EstateCopilot team member sent you.',
  },
  {
    n: 3,
    title: 'Sign in with your phone number',
    body:
      'Enter your mobile number and the one-time code you receive. There is no password — the code logs you in each time.',
  },
  {
    n: 4,
    title: 'Add your details',
    body:
      'Add your name. You can add your bank account under "Wallet" later — you do not need it to start sharing your link.',
  },
  {
    n: 5,
    title: 'Get your referral link',
    body:
      'Open the "Links" tab. Your link looks like estatecopilot.org/?ref=YOURCODE . Share the plain link, or point it at a specific page — both carry your code. A click is credited to you for 30 days, even if the landlord signs up later.',
  },
  {
    n: 6,
    title: 'Share it, track it, get paid',
    body:
      'Send it with a short, honest pitch. Good places: your WhatsApp status, landlord groups you are part of, your email signature, one-to-one with clients. Do not spam groups or sign people up for them. "Home" shows clicks and signups; "Wallet" shows earnings, payable once the landlord\'s payment clears. Add your bank under "Wallet" to be paid on a regular cycle.',
  },
];

// ---- registry -----------------------------------------------------

export const ONBOARDING: Record<OnboardingAudience, OnboardingTrack> = {
  landlord: {
    label: 'Landlord onboarding',
    who: 'Someone who owns property and wants to list, let or manage it on EstateCopilot.',
    guideFile: 'landlord-guide.html',
    steps: LANDLORD,
  },
  tenant: {
    label: 'Tenant guide',
    who: 'Someone renting a home whose landlord uses EstateCopilot (usually has an invite link).',
    guideFile: 'tenant-guide.html',
    steps: TENANT,
  },
  artisan: {
    label: 'Artisan onboarding',
    who: 'A tradesperson (electrician, plumber, tiler, AC/generator tech, carpenter, etc.) who wants jobs.',
    guideFile: 'artisan-guide.html',
    steps: ARTISAN,
  },
  partner: {
    label: 'Referral (Kolo) partner onboarding',
    who: 'An agent, manager, caretaker or anyone with landlord contacts who wants to earn referral commission.',
    guideFile: 'referral-guide.html',
    steps: PARTNER,
  },
};

export const ONBOARDING_AUDIENCES = Object.keys(ONBOARDING) as OnboardingAudience[];

export function isOnboardingAudience(v: unknown): v is OnboardingAudience {
  return typeof v === 'string' && (ONBOARDING_AUDIENCES as string[]).includes(v);
}

export function audienceMenu(): string {
  return ONBOARDING_AUDIENCES.map((a) => `${a} — ${ONBOARDING[a].who}`).join('\n');
}

export function onboardingOverview(audience: OnboardingAudience): string {
  const t = ONBOARDING[audience];
  return `${t.label} — ${t.steps.length} steps:\n` + t.steps.map((s) => `${s.n}. ${s.title}`).join('\n');
}

export function onboardingStep(audience: OnboardingAudience, n: number): OnboardingStep | undefined {
  return ONBOARDING[audience].steps.find((s) => s.n === n);
}
