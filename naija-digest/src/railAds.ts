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
  // A sponsor's own hosted file — for advertisers without YouTube.
  // Click-to-play, never autoplay (this site's data-saver rule applies to
  // ads too, not just editorial content).
  videoUrl?: string;
  // A YouTube video or live stream id (the part after "v=" or after
  // youtu.be/) — covers sponsors who do have YouTube content. Rendered as
  // a click-to-play "lite embed": only the free thumbnail loads until the
  // visitor actually clicks play.
  youtubeId?: string;
}

export const RAIL_AD_SLOTS = 3;
export const RAIL_ADS: RailAd[] = [];
