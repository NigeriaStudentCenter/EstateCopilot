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

// Three real videos from the real, verified Nigeria Student Ambassador
// YouTube channel (confirmed via YouTube's own oEmbed metadata before
// wiring these in — author_name/author_url both matched the channel
// already linked from the community rail). Not a placeholder and not a
// third-party sponsor: this is the org promoting its own content in the
// slots that would otherwise sit empty, the same legitimate use of unsold
// ad inventory as the "your brand here" house card, just with something
// real to show instead.
export const RAIL_ADS: RailAd[] = [
  {
    id: 'nsa-video-1',
    advertiser: 'Nigeria Student Ambassador',
    headline: 'The Future is Moving — How Ready Are You?',
    body: 'From the Nigeria Student Ambassador channel.',
    url: 'https://youtu.be/5mmqTT3aTuI',
    youtubeId: '5mmqTT3aTuI',
  },
  {
    id: 'nsa-video-2',
    advertiser: 'Nigeria Student Ambassador',
    headline: 'HR Students & AI Adoption',
    body: 'From the Nigeria Student Ambassador channel.',
    url: 'https://youtu.be/dn1pwfas-Wc',
    youtubeId: 'dn1pwfas-Wc',
  },
  {
    id: 'nsa-video-3',
    advertiser: 'Nigeria Student Ambassador',
    headline: 'How Money Thinks',
    body: 'From the Nigeria Student Ambassador channel.',
    url: 'https://youtu.be/Z116owQjGkI',
    youtubeId: 'Z116owQjGkI',
  },
];
