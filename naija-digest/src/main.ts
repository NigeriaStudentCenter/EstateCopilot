import './style.css';
import feedData from './feed.json';
import { AD_CONFIG, ensureAdScriptLoaded, renderAdSlotHtml, pushAdSlots } from './ads';
import { PARTNER_SLOTS, MAX_PARTNERS_PER_DESK, PARTNER_SPACING } from './partners';
import { RAIL_ADS, RAIL_AD_SLOTS } from './railAds';
import { mountChat } from './chat';

interface FeedItem {
  id: string;
  desks: string[];
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt: string;
}

interface Feed {
  generatedAt: string;
  items: FeedItem[];
}

const DESKS = [
  { id: 'top-stories', label: 'Top Stories' },
  { id: 'politics', label: 'Politics' },
  { id: 'business', label: 'Business' },
  { id: 'sports', label: 'Sports' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'metro', label: 'Metro' },
  { id: 'diaspora', label: 'Diaspora & Return' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'properties', label: 'Properties' },
  { id: 'saved', label: 'Saved' },
] as const;

const SAVED_KEY = 'naijaDigestSaved';

function loadSaved(): Set<string> {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistSaved(saved: Set<string>) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...saved]));
  } catch {
    // localStorage unavailable (private mode, blocked) — saving just won't
    // persist across reloads; the toggle still works for this session.
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const searchIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`;

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

function wireRailAdVideoButtons(root: ParentNode) {
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

const communityRailHtml = `
  <div class="rail-card community-card community-card-compact">
    <p class="community-eyebrow">Nigeria Student Ambassador</p>
    <div class="community-compact-row">
      <a class="community-live" href="https://nigeriastudentambassador.com/live" target="_blank" rel="noopener noreferrer">Watch the journey →</a>
    </div>
    <div class="community-links">
      <a href="https://www.youtube.com/@NigeriaStudentAmbassador" target="_blank" rel="noopener noreferrer">YouTube</a>
      <a href="https://www.instagram.com/nsambassador" target="_blank" rel="noopener noreferrer">Instagram</a>
      <a href="https://www.tiktok.com/@nsambassador" target="_blank" rel="noopener noreferrer">TikTok</a>
      <a href="https://x.com/nsambassador" target="_blank" rel="noopener noreferrer">X</a>
    </div>
  </div>
  <div class="rail-card saved-card saved-card-compact">
    <p class="saved-title">Your saved stories: <span class="saved-count" id="saved-count">0</span></p>
  </div>`;

async function main() {
  const app = document.getElementById('app')!;
  const leftRailHtml = Array.from({ length: RAIL_AD_SLOTS }, (_, i) => railAdHtml(RAIL_ADS[i])).join('');

  app.innerHTML = `
    <div class="layout">
      <aside class="rail rail-left" aria-label="Sponsored">${leftRailHtml}</aside>
      <div class="page">
        <div class="topbar">
          <div class="logo">Global Nigeria<span class="accent">Student</span>Ambassador</div>
          <div class="badge">Naija Digest</div>
        </div>
        <h1 class="title">Home news, wherever you are</h1>
        <p class="sub">Every major Nigerian paper, plus the diaspora &amp; return stories that matter to this community. Headlines link straight to the outlet that reported them.</p>
        <p class="updated" id="updated"></p>
        <div class="search">
          ${searchIcon}
          <input id="search" type="search" placeholder="Search today's stories…" aria-label="Search stories" />
        </div>
        <div class="desks" id="desks" role="tablist" aria-label="News desks"></div>
        <div class="cards" id="cards"></div>
        <footer class="colophon">
          Naija Digest is an automated headline feed — summaries link to the
          outlet that reported each story. Built for
          <a href="https://nigeriastudentambassador.com">Nigeria Student Ambassador</a>.
          · <a href="./digest.txt">Today's 5-story digest (text)</a>
        </footer>
      </div>
      <aside class="rail rail-right" aria-label="Community">
        <div id="chat-mount"></div>
        ${communityRailHtml}
      </aside>
    </div>
  `;

  const desksEl = document.getElementById('desks')!;
  const cardsEl = document.getElementById('cards')!;
  const searchEl = document.getElementById('search') as HTMLInputElement;
  const updatedEl = document.getElementById('updated')!;
  const savedCountEl = document.getElementById('saved-count')!;
  const leftRailEl = document.querySelector<HTMLElement>('.rail-left')!;
  const chatMountEl = document.getElementById('chat-mount')!;

  wireRailAdVideoButtons(leftRailEl);
  // Chat is desktop-only (the rail itself is hidden below 1180px via CSS)
  // — no point opening a socket a mobile visitor will never see. Reactive,
  // not a one-time check at load: a static check would miss anyone who
  // resizes across the breakpoint after the page has already loaded
  // (maximizing a window, rotating a tablet), leaving the rail visible via
  // CSS but the chat panel never mounted.
  const desktopQuery = window.matchMedia('(min-width: 1180px)');
  let chatMounted = false;
  function syncChatToViewport() {
    if (desktopQuery.matches && !chatMounted) {
      chatMounted = true;
      mountChat(chatMountEl);
    }
  }
  syncChatToViewport();
  desktopQuery.addEventListener('change', syncChatToViewport);

  // Baked in at build time by build-feed.ts, rebuilt every 30 minutes by
  // the Actions workflow — no runtime fetch, one less request on a
  // data-conscious connection.
  const feed = feedData as Feed;
  let activeDesk: (typeof DESKS)[number]['id'] = 'top-stories';
  let query = '';
  const saved = loadSaved();

  updatedEl.textContent = feed.items.length
    ? `Updated ${relativeTime(feed.generatedAt)}`
    : "Feed hasn't loaded — check back in a moment.";

  function renderDesks() {
    desksEl.innerHTML = DESKS.map(
      (desk) => `
      <button class="desk-pill" data-desk="${desk.id}" role="tab" aria-pressed="${desk.id === activeDesk}">
        ${desk.label}
      </button>`,
    ).join('');
    desksEl.querySelectorAll<HTMLButtonElement>('.desk-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeDesk = btn.dataset.desk as typeof activeDesk;
        renderDesks();
        renderCards();
      });
    });
  }

  function currentItems(): FeedItem[] {
    let items =
      activeDesk === 'saved'
        ? feed.items.filter((item) => saved.has(item.id))
        : feed.items.filter((item) => item.desks.includes(activeDesk));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(
        (item) => item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q),
      );
    }
    return items;
  }

  function cardHtml(item: FeedItem): string {
    return `
      <article class="card">
        <a class="headline" href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
        <p class="summary">${escapeHtml(item.summary)}</p>
        <div class="meta">
          <span class="who">${escapeHtml(item.source)} · ${relativeTime(item.publishedAt)}</span>
          <button class="save-btn" data-id="${item.id}" aria-pressed="${saved.has(item.id)}" aria-label="Save story">${saved.has(item.id) ? '★' : '☆'}</button>
        </div>
      </article>`;
  }

  function partnerCardHtml(slot: (typeof PARTNER_SLOTS)[number]): string {
    return `
      <article class="card partner-card">
        <span class="partner-tag">Partner · ${escapeHtml(slot.advertiser)}</span>
        <a class="headline" href="${slot.url}" target="_blank" rel="noopener noreferrer sponsored">${escapeHtml(slot.title)}</a>
        <p class="summary">${escapeHtml(slot.body)}</p>
      </article>`;
  }

  function renderCards() {
    const items = currentItems();
    if (!items.length) {
      const message =
        activeDesk === 'saved'
          ? 'Nothing saved yet — tap the star on any story to keep it here.'
          : query.trim()
            ? 'No stories match that search in this desk.'
            : 'No stories yet for this desk — check back after the next refresh.';
      cardsEl.innerHTML = `<p class="empty">${message}</p>`;
      return;
    }

    // Up to MAX_PARTNERS_PER_DESK sponsor cards for this desk, spaced every
    // PARTNER_SPACING stories — never mixed anonymously into the ranked
    // list, always labeled "Partner". Configuring more than the cap in
    // partners.ts just means the extras don't show, rather than the page
    // silently turning into an ad wall.
    const deskPartners = PARTNER_SLOTS.filter((p) => p.desk === activeDesk).slice(0, MAX_PARTNERS_PER_DESK);
    let adCount = 0;
    let partnerIndex = 0;
    const html: string[] = [];
    items.forEach((item, i) => {
      if (i > 0 && i % PARTNER_SPACING === 0 && partnerIndex < deskPartners.length) {
        html.push(partnerCardHtml(deskPartners[partnerIndex]));
        partnerIndex++;
      }
      html.push(cardHtml(item));
      if (AD_CONFIG.enabled && (i + 1) % AD_CONFIG.everyNCards === 0) {
        adCount++;
        html.push(renderAdSlotHtml(`ad-slot-${activeDesk}-${i}`));
      }
    });
    cardsEl.innerHTML = html.join('');

    cardsEl.querySelectorAll<HTMLButtonElement>('.save-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id!;
        if (saved.has(id)) saved.delete(id);
        else saved.add(id);
        persistSaved(saved);
        renderSavedCount();
        renderCards();
      });
    });

    if (AD_CONFIG.enabled && adCount > 0) {
      ensureAdScriptLoaded();
      pushAdSlots(adCount);
    }
  }

  function renderSavedCount() {
    savedCountEl.textContent = String(saved.size);
  }

  searchEl.addEventListener('input', () => {
    query = searchEl.value;
    renderCards();
  });

  renderDesks();
  renderCards();
  renderSavedCount();
}

main();
