// Left-rail sponsor slots — the desktop-only wide margins either side of the
// reading column. Distinct from the in-feed partner cards (partners.ts):
// these are persistent for the whole session rather than scrolled past once.
// Empty by default; unsold slots show a "your ad here" house card instead of
// blank space or a fake advertiser — turning unsold inventory into a pitch
// is honest, showing a placeholder brand is not.
export interface RailAd {
  id: string;
  advertiser: string;
  headline: string;
  body: string;
  url: string;
  imageUrl?: string;
  videoUrl?: string;
}

export const RAIL_AD_SLOTS = 3;
export const RAIL_ADS: RailAd[] = [];
