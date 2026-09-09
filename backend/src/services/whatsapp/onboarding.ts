// Landlord onboarding, broken into small steps the agent can walk a user
// through one at a time on WhatsApp — each step has short copy plus an
// illustration (and the intro has the walkthrough video). The images and
// video are the same assets used by the public illustrated guide at
// marketing/public/guides/ (landlord-guide.html), served from the marketing
// site.

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

export function mediaBase(): string {
  return (process.env.WA_ONBOARDING_MEDIA_BASE ?? 'https://estatecopilot.org').replace(/\/$/, '');
}
export const imageUrl = (file: string) => `${mediaBase()}/guides/images/${file}`;
export const videoUrl = (file: string) => `${mediaBase()}/videos/${file}`;
export const landlordGuideUrl = () => `${mediaBase()}/guides/landlord-guide.html`;

export const LANDLORD_ONBOARDING: OnboardingStep[] = [
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

export function onboardingOverview(): string {
  return (
    `Landlord onboarding has ${LANDLORD_ONBOARDING.length} steps:\n` +
    LANDLORD_ONBOARDING.map((s) => `${s.n}. ${s.title}`).join('\n')
  );
}
