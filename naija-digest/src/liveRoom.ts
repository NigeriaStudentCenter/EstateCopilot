// Lightweight entry point — deliberately has zero heavy dependencies.
// livekit-client (~200KB gzipped) only gets fetched via the dynamic
// import below, once we already know it's actually needed. Every visitor
// pays the cost of this file (a couple of fetch calls); only visitors who
// land during a live session or open the page as the host pay for the
// real audio/chat library.
const API_BASE = 'https://naija-digest-chat-api.azurewebsites.net';

// A host reaches this by opening the page with ?host=1 in the URL — not a
// button anyone browsing normally would see. Matches the plan: no public
// "become host" UI.
const IS_HOST_ENTRY = new URLSearchParams(location.search).get('host') === '1';

interface MountLiveRoomOptions {
  // Which site's audio room to mount: 'news' (Naija Digest) or 'students'
  // (Student Tools). They are entirely separate LiveKit rooms. Defaults to
  // 'news' on the server too, so omitting it is safe.
  room?: string;
}

export async function mountLiveRoom(root: HTMLElement, options: MountLiveRoomOptions = {}) {
  const room = options.room ?? 'news';
  root.innerHTML = `<div class="rail-card live-room-card" id="live-room-card"><p class="live-room-status">Checking…</p></div>`;
  const card = root.querySelector<HTMLDivElement>('#live-room-card')!;

  let status: { live: boolean };
  try {
    status = await fetch(`${API_BASE}/live/status?room=${encodeURIComponent(room)}`).then((r) => r.json());
  } catch {
    card.innerHTML = `<p class="live-room-status">Live room unavailable right now.</p>`;
    return;
  }

  if (!status.live && !IS_HOST_ENTRY) {
    card.innerHTML = `
      <p class="live-room-eyebrow">🔊 Live Room</p>
      <p class="live-room-status">Not live right now — check back later.</p>`;
    return;
  }

  const { activateLiveRoom } = await import('./liveRoomActive');
  activateLiveRoom(root, card, API_BASE, IS_HOST_ENTRY, status.live, room);
}
