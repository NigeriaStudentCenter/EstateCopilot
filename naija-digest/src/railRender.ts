// Left-rail sponsor/house-card rendering, shared by the news digest
// (src/main.ts) and the Student Tools page (src/students/main.ts) so the
// click-to-play "lite embed" behaviour stays identical on both.

import { RAIL_ADS, RAIL_AD_SLOTS } from './railAds';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const playIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

// Click-to-play for any video ad, YouTube or self-hosted — nothing but a
// thumbnail loads until the visitor actually clicks. Page-load autoplay
// would break the same data-saver rule this site holds for editorial
// content; a click is an explicit, low-cost opt-in.
function railAdVideoWrapHtml(slot: (typeof RAIL_ADS)[number]): string {
  if (slot.youtubeId) {
    return `
      <button class="rail-ad-video-wrap" data-kind="youtube" data-src="${slot.youtubeId}" aria-label="Play video">
        <img class="rail-ad-media" src="https://i.ytimg.com/vi/${slot.youtubeId}/hqdefault.jpg" alt="" loading="lazy" />
        <span class="rail-ad-play-btn">${playIcon}</span>
      </button>`;
  }
  if (slot.videoUrl) {
    return `
      <button class="rail-ad-video-wrap" data-kind="file" data-src="${slot.videoUrl}" aria-label="Play video">
        <span class="rail-ad-play-btn">${playIcon}</span>
      </button>`;
  }
  return '';
}

function railAdHtml(slot: (typeof RAIL_ADS)[number] | undefined): string {
  if (slot) {
    const hasVideo = Boolean(slot.youtubeId || slot.videoUrl);
    const media = hasVideo
      ? railAdVideoWrapHtml(slot)
      : slot.imageUrl
        ? `<img class="rail-ad-media" src="${slot.imageUrl}" alt="${escapeHtml(slot.advertiser)}" loading="lazy" />`
        : '';
    // A video ad can't be one big <a> (the play button needs its own
    // click), so only the title links out; a plain image ad stays a
    // single clickable card like before.
    const body = `
        <span class="rail-ad-label">Advertisement · ${escapeHtml(slot.advertiser)}</span>
        ${media}
        <p class="rail-ad-title">${escapeHtml(slot.headline)}</p>
        <p class="rail-ad-sub">${escapeHtml(slot.body)}</p>`;
    return hasVideo
      ? `<div class="rail-card rail-ad">${body}<a class="rail-ad-cta" href="${slot.url}" target="_blank" rel="noopener noreferrer sponsored">Learn more →</a></div>`
      : `<a class="rail-card rail-ad" href="${slot.url}" target="_blank" rel="noopener noreferrer sponsored">${body}</a>`;
  }
  return `
    <a class="rail-card rail-ad rail-ad-house" href="https://nigeriastudentambassador.com" target="_blank" rel="noopener noreferrer">
      <span class="rail-ad-label">Advertisement</span>
      <p class="rail-ad-title">Your brand here</p>
      <p class="rail-ad-sub">Reach readers at home and across the diaspora — daily.</p>
      <span class="rail-ad-cta">Advertise with us →</span>
    </a>`;
}

/** The full left-rail markup: one card per slot, house card where unsold. */
export function leftRailAdsHtml(): string {
  return Array.from({ length: RAIL_AD_SLOTS }, (_, i) => railAdHtml(RAIL_ADS[i])).join('');
}

export function wireRailAdVideoButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('.rail-ad-video-wrap').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.kind;
      const src = btn.dataset.src!;
      if (kind === 'youtube') {
        btn.outerHTML = `<div class="rail-ad-video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${src}?autoplay=1" title="Sponsor video" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
      } else {
        btn.outerHTML = `<div class="rail-ad-video-wrap"><video src="${src}" controls autoplay playsinline></video></div>`;
      }
    });
  });
}
