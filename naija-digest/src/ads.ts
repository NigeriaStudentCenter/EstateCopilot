// Programmatic ad wiring — off by default. There is no live ad account yet,
// and a brand-new site has no traffic history to get one approved with
// anyway. Flip `enabled` once you have an approved AdSense (or similar)
// publisher id; nothing loads, and no script tag is injected, until then.
export const AD_CONFIG = {
  enabled: false,
  publisherId: '', // e.g. 'ca-pub-1234567890123456'
  slotId: '', // ad unit id from your AdSense dashboard
  everyNCards: 4, // one ad slot after every N story cards in a desk
};

let scriptLoaded = false;

export function ensureAdScriptLoaded() {
  if (scriptLoaded || !AD_CONFIG.enabled || !AD_CONFIG.publisherId) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CONFIG.publisherId}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
  scriptLoaded = true;
}

export function renderAdSlotHtml(id: string): string {
  if (!AD_CONFIG.enabled || !AD_CONFIG.publisherId || !AD_CONFIG.slotId) return '';
  return `
    <div class="ad-slot" id="${id}">
      <span class="ad-slot-label">Advertisement</span>
      <ins class="adsbygoogle"
        style="display:block"
        data-ad-client="${AD_CONFIG.publisherId}"
        data-ad-slot="${AD_CONFIG.slotId}"
        data-ad-format="auto"
        data-full-width-responsive="true"></ins>
    </div>`;
}

export function pushAdSlots(count: number) {
  if (!AD_CONFIG.enabled) return;
  const w = window as unknown as { adsbygoogle?: unknown[] };
  w.adsbygoogle = w.adsbygoogle || [];
  for (let i = 0; i < count; i++) w.adsbygoogle.push({});
}
