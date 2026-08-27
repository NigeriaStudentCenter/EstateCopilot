import { Room, RoomEvent, RemoteParticipant, RemoteTrack, Track } from 'livekit-client';

// Split out of liveRoom.ts on purpose: livekit-client is a large library
// (the bundle jumped from ~200KB to ~770KB when it was a static import),
// and the vast majority of visitors will never see a live session. This
// module is only ever reached via a dynamic import from liveRoom.ts, once
// the lightweight status check has already confirmed there's a real
// reason to pay for it — so the base page stays light for everyone else,
// matching this site's data-saver principle everywhere else.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initials(identity: string): string {
  const clean = identity.replace(/^guest-/, '').replace(/^host$/, 'H');
  return clean.slice(0, 2).toUpperCase();
}

interface PendingRequest {
  identity: string;
  name?: string;
}

export function activateLiveRoom(
  root: HTMLElement,
  card: HTMLDivElement,
  apiBase: string,
  isHostEntry: boolean,
  isLive: boolean,
  // Which site's room this is ('news' | 'students'). Sent on every call so
  // the backend acts on the right LiveKit room. Defaults to 'news'.
  siteRoom = 'news',
) {
  const room = new Room();
  let hostSecret: string | null = null;
  const pending = new Map<string, PendingRequest>();
  const audioEls = new Map<string, HTMLAudioElement>();
  // Identities the host has muted. A muted person has canPublish:false, so
  // on the tiles they'd otherwise be indistinguishable from a listener —
  // this set is what lets the host tile show "Unmute" instead. Lost if the
  // host reloads mid-session; a muted person can re-raise their hand.
  const mutedByHost = new Set<string>();

  function renderShell() {
    const isHost = hostSecret !== null;
    card.innerHTML = `
      <div class="live-room-header">
        <span class="chat-live-dot"></span>
        <span class="live-room-title">Live Room</span>
        ${isHost ? '<button class="live-room-end" id="live-end">End</button>' : ''}
      </div>
      <div class="live-room-tiles" id="live-tiles"></div>
      ${
        isHost
          ? '<div class="live-room-requests" id="live-requests"></div>'
          : '<button class="live-room-raise" id="live-raise">🎤 Request to speak</button><p class="live-room-note" id="live-note"></p>'
      }
    `;
    renderTiles();
    if (isHost) renderRequests();
    else root.querySelector<HTMLButtonElement>('#live-raise')?.addEventListener('click', raiseHand);
    root.querySelector<HTMLButtonElement>('#live-end')?.addEventListener('click', endHosting);
  }

  function tileHtml(identity: string, canPublish: boolean, speaking: boolean): string {
    const isHostTile = identity === 'host';
    const isHost = hostSecret !== null;
    const muted = mutedByHost.has(identity);
    const isSpeaker = canPublish && !muted;
    const label = isHostTile ? 'Host' : muted ? 'Muted' : canPublish ? 'Speaker' : 'Listening';

    let controls = '';
    if (isHost && !isHostTile) {
      if (isSpeaker) {
        controls += `<button class="live-tile-act" data-act="mute" data-identity="${identity}">Mute</button>`;
      } else if (muted) {
        controls += `<button class="live-tile-act" data-act="unmute" data-identity="${identity}">Unmute</button>`;
      }
      controls += `<button class="live-tile-mute" data-act="remove" data-identity="${identity}" title="Remove from the room">✕</button>`;
    }
    return `
      <div class="live-tile ${speaking && isSpeaker ? 'live-tile-speaking' : ''} ${muted ? 'live-tile-muted' : ''}">
        <div class="live-tile-avatar">${initials(identity)}</div>
        <span class="live-tile-label">${label}</span>
        ${controls}
      </div>`;
  }

  function renderTiles() {
    const tilesEl = root.querySelector<HTMLDivElement>('#live-tiles');
    if (!tilesEl) return;
    const participants = [room.localParticipant, ...room.remoteParticipants.values()];
    tilesEl.innerHTML = participants
      .map((p) => tileHtml(p.identity, p.permissions?.canPublish ?? p.identity === 'host', p.isSpeaking))
      .join('');
    tilesEl.querySelectorAll<HTMLButtonElement>('.live-tile-act, .live-tile-mute').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.identity!;
        if (btn.dataset.act === 'remove') removeParticipant(id);
        else if (btn.dataset.act === 'mute') setMuted(id, true);
        else if (btn.dataset.act === 'unmute') setMuted(id, false);
      });
    });
  }

  function renderRequests() {
    const el = root.querySelector<HTMLDivElement>('#live-requests');
    if (!el) return;
    if (pending.size === 0) {
      el.innerHTML = `<p class="live-room-note">No requests to speak yet.</p>`;
      return;
    }
    el.innerHTML = [...pending.values()]
      .map(
        (p) => `
        <div class="live-request">
          <span>${escapeHtml(p.name || p.identity)} wants to speak</span>
          <button class="live-request-approve" data-identity="${p.identity}">Approve</button>
        </div>`,
      )
      .join('');
    el.querySelectorAll<HTMLButtonElement>('.live-request-approve').forEach((btn) => {
      btn.addEventListener('click', () => approve(btn.dataset.identity!));
    });
  }

  async function raiseHand() {
    const noteEl = root.querySelector<HTMLParagraphElement>('#live-note');
    try {
      const res = await fetch(`${apiBase}/live/raise-hand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: room.localParticipant.identity,
          name: room.localParticipant.identity,
          room: siteRoom,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (noteEl) noteEl.textContent = data.error ?? 'Could not send request.';
        return;
      }
      if (noteEl) noteEl.textContent = 'Request sent — waiting for the host.';
    } catch {
      if (noteEl) noteEl.textContent = 'Could not send request.';
    }
  }

  async function approve(identity: string) {
    if (!hostSecret) return;
    await fetch(`${apiBase}/live/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: hostSecret, identity, room: siteRoom }),
    }).catch(() => {});
    pending.delete(identity);
    renderRequests();
  }

  async function removeParticipant(identity: string) {
    if (!hostSecret) return;
    await fetch(`${apiBase}/live/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: hostSecret, identity, room: siteRoom }),
    }).catch(() => {});
    mutedByHost.delete(identity);
  }

  async function setMuted(identity: string, muted: boolean) {
    if (!hostSecret) return;
    // Optimistic: flip the local state and re-render now, so the tile
    // label/button change immediately; the permission change echoes back
    // via ParticipantPermissionsChanged a moment later.
    if (muted) mutedByHost.add(identity);
    else mutedByHost.delete(identity);
    renderTiles();
    await fetch(`${apiBase}/live/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: hostSecret, identity, muted, room: siteRoom }),
    }).catch(() => {});
  }

  async function endHosting() {
    if (!hostSecret) return;
    await fetch(`${apiBase}/live/host/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: hostSecret, room: siteRoom }),
    }).catch(() => {});
    await room.disconnect();
    card.innerHTML = `<p class="live-room-status">Session ended.</p>`;
  }

  room.on(RoomEvent.ParticipantConnected, renderTiles);
  room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
    mutedByHost.delete(p.identity);
    renderTiles();
  });
  room.on(RoomEvent.ActiveSpeakersChanged, renderTiles);
  room.on(RoomEvent.ParticipantPermissionsChanged, (prevPermissions) => {
    renderTiles();
    const nowCanPublish = room.localParticipant.permissions?.canPublish ?? false;
    const wasCanPublish = prevPermissions?.canPublish ?? false;
    const noteEl = root.querySelector<HTMLParagraphElement>('#live-note');

    // Approved: the server grant alone doesn't turn the mic on — the
    // client has to react. This is that reaction.
    if (nowCanPublish && !wasCanPublish) {
      room.localParticipant.setMicrophoneEnabled(true).catch((err) => {
        console.error('microphone unavailable:', err);
        if (noteEl) noteEl.textContent = "You're approved, but your microphone is unavailable.";
      });
    }
    // Muted by the host: release the mic locally so it matches, and say so.
    if (!nowCanPublish && wasCanPublish) {
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      if (noteEl) noteEl.textContent = 'The host muted you — you can still listen. Raise your hand to speak again.';
    }
  });

  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach() as HTMLAudioElement;
    el.autoplay = true;
    audioEls.set(participant.identity, el);
    root.appendChild(el);
    el.style.display = 'none';
  });
  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    track.detach().forEach((el) => el.remove());
  });

  room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type === 'raise-hand' && msg.identity) {
        pending.set(msg.identity, { identity: msg.identity, name: msg.name });
        renderRequests();
      }
    } catch {
      // ignore malformed data messages
    }
  });

  async function connectAsListener() {
    const res = await fetch(`${apiBase}/live/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: siteRoom }),
    });
    if (!res.ok) {
      card.innerHTML = `<p class="live-room-status">Live room unavailable right now.</p>`;
      return;
    }
    const { token, url } = await res.json();
    await room.connect(url, token);
    renderShell();
  }

  async function connectAsHost(secret: string): Promise<boolean> {
    const res = await fetch(`${apiBase}/live/host/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, room: siteRoom }),
    });
    if (!res.ok) return false;
    const { token, url } = await res.json();
    await room.connect(url, token);
    hostSecret = secret;
    renderShell();
    // A denied/missing mic shouldn't take down the rest of hosting — the
    // room connection and moderation controls (approve/mute/remove) are
    // still fully usable without it; the host just can't be heard yet.
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      console.error('microphone unavailable:', err);
      const noteEl = document.createElement('p');
      noteEl.className = 'live-room-note';
      noteEl.textContent = 'Microphone unavailable — check your browser permissions.';
      card.appendChild(noteEl);
    }
    return true;
  }

  function renderHostForm(alreadyLive: boolean) {
    card.innerHTML = `
      <p class="live-room-eyebrow">🔊 Live Room</p>
      <p class="live-room-status">${alreadyLive ? 'Already live — enter the host key to take control.' : 'Start a session'}</p>
      <form class="live-host-form" id="live-host-form">
        <input type="password" id="live-host-secret" placeholder="Host key" autocomplete="off" />
        <button type="submit">${alreadyLive ? 'Join as host' : 'Go live'}</button>
      </form>
      <p class="live-room-note" id="live-host-error"></p>`;
    root.querySelector<HTMLFormElement>('#live-host-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = root.querySelector<HTMLInputElement>('#live-host-secret')!;
      const ok = await connectAsHost(input.value);
      if (!ok) root.querySelector<HTMLParagraphElement>('#live-host-error')!.textContent = 'Wrong key.';
    });
  }

  if (isHostEntry) {
    renderHostForm(isLive);
    return;
  }

  // Live, regular visitor: show a join prompt rather than auto-connecting
  // everyone who loads the page while a session happens to be running.
  card.innerHTML = `
    <p class="live-room-eyebrow">🔴 Live now</p>
    <p class="live-room-status">Someone's hosting a live audio room.</p>
    <button class="live-room-join" id="live-join">Join to listen →</button>`;
  root.querySelector<HTMLButtonElement>('#live-join')?.addEventListener('click', connectAsListener);
}
