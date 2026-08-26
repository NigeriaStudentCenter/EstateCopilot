// Affiliate / sponsorship slots — empty by default. This never ships a
// placeholder or fake sponsor to a reader; add a real entry only once you
// have an actual affiliate link or paid sponsorship to run. Each slot shows
// once, at a fixed position, in the desk it's assigned to — visually
// labeled "Partner" so it's never confused with editorial content (same
// rule the agent's own copyright posture depends on).
export interface PartnerSlot {
  id: string;
  desk: string; // which desk id this appears in, e.g. 'sports'
  advertiser: string; // shown in the tag, e.g. "SportyBet"
  title: string;
  body: string;
  url: string;
}

export const PARTNER_SLOTS: PartnerSlot[] = [];

// How many sponsor cards a single desk view will show at once, and how many
// story cards apart they're spaced. This is a deliberate ceiling, not a
// technical one — the page could render as many as you configure, but the
// entire pitch of Naija Digest is "not another ad-cluttered news site."
// Selling desk sponsorship as a defined, scarce product (one or two slots
// per desk) is also just an easier thing to sell than "unlimited inventory."
export const MAX_PARTNERS_PER_DESK = 2;
export const PARTNER_SPACING = 5; // story cards between sponsor cards
