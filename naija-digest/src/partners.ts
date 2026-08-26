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
