// Token minting + host moderation for the TikTok-Live-style audio room.
// This is plain HTTP with no special networking needs, so it lives here
// on the existing chat backend rather than a third service — the actual
// WebRTC media routing happens on a separate self-hosted LiveKit instance
// (naija-digest-rg / naija-digest-live container group) which is the only
// piece that needed infrastructure this App Service can't provide.
//
// Speaker access is host-approved only, not open mic: a listener can only
// ever get roomJoin + subscribe by default. The only way a listener's
// permissions change is the host calling /live/approve, which is the
// actual safety mechanism for this feature — there is no automated
// content filter for live audio the way there is for text chat.
//
// Two independent rooms, one per site: "news" (the Naija Digest page) and
// "students" (the Student Tools page). They are separate LiveKit rooms
// with separate live/host state, so a session on one has nothing to do
// with the other. Clients pass ?room= / {room} ; anything unrecognised
// (including older cached news-page JS that sends nothing) falls back to
// "news", which keeps the original LiveKit room name unchanged.
import { Router } from 'express';
import { AccessToken, RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'https://live.nigeriastudentambassador.com';
const LIVEKIT_WS_URL = LIVEKIT_URL.replace(/^https/, 'wss');
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
const HOST_SECRET = process.env.HOST_SECRET ?? '';
const HOST_IDENTITY = 'host';

const SITE_ROOMS = ['news', 'students'] as const;
type SiteRoom = (typeof SITE_ROOMS)[number];
const DEFAULT_SITE_ROOM: SiteRoom = 'news';

// The LiveKit room name per site. "news" keeps the original name so an
// in-flight session isn't disrupted by this change.
const LIVEKIT_ROOM: Record<SiteRoom, string> = {
  news: 'naija-digest-live',
  students: 'student-tools-live',
};

function resolveRoom(raw: unknown): SiteRoom {
  return SITE_ROOMS.includes(raw as SiteRoom) ? (raw as SiteRoom) : DEFAULT_SITE_ROOM;
}

const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

const liveActive: Record<SiteRoom, boolean> = { news: false, students: false };

// A raise-hand per identity every few seconds is plenty — the "basic
// per-identity cooldown" that is the only spam guard for this endpoint in
// v1. Tracked per site room so the two don't share a cooldown table.
const lastRaiseHandAt: Record<SiteRoom, Map<string, number>> = { news: new Map(), students: new Map() };
const RAISE_HAND_COOLDOWN_MS = 5000;

function requireHostSecret(req: import('express').Request, res: import('express').Response): boolean {
  const secret = req.body?.secret;
  if (!HOST_SECRET || secret !== HOST_SECRET) {
    res.status(403).json({ error: 'invalid host secret' });
    return false;
  }
  return true;
}

export const liveRouter = Router();

liveRouter.get('/live/status', (req, res) => {
  const room = resolveRoom(req.query?.room);
  res.json({ live: liveActive[room], room, roomName: LIVEKIT_ROOM[room] });
});

liveRouter.post('/live/host/start', async (req, res) => {
  if (!requireHostSecret(req, res)) return;
  const room = resolveRoom(req.body?.room);
  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: HOST_IDENTITY });
    token.addGrant({
      room: LIVEKIT_ROOM[room],
      roomJoin: true,
      roomAdmin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const jwt = await token.toJwt();
    liveActive[room] = true;
    res.json({ token: jwt, url: LIVEKIT_WS_URL, identity: HOST_IDENTITY, room });
  } catch (err) {
    console.error('host/start failed:', err);
    res.status(500).json({ error: 'could not start' });
  }
});

liveRouter.post('/live/host/end', async (req, res) => {
  if (!requireHostSecret(req, res)) return;
  const room = resolveRoom(req.body?.room);
  liveActive[room] = false;
  try {
    await roomService.deleteRoom(LIVEKIT_ROOM[room]);
  } catch {
    // Room may not exist if nobody ever joined — not an error worth surfacing.
  }
  res.json({ ok: true });
});

liveRouter.post('/live/join', async (req, res) => {
  const room = resolveRoom(req.body?.room);
  if (!liveActive[room]) return res.status(409).json({ error: 'not live right now' });
  try {
    const identity = `guest-${Math.random().toString(36).slice(2, 9)}`;
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity });
    token.addGrant({
      room: LIVEKIT_ROOM[room],
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
      canPublishData: true,
    });
    res.json({ token: await token.toJwt(), url: LIVEKIT_WS_URL, identity, room });
  } catch (err) {
    console.error('join failed:', err);
    res.status(500).json({ error: 'could not join' });
  }
});

liveRouter.post('/live/raise-hand', async (req, res) => {
  const { identity, name } = req.body ?? {};
  const room = resolveRoom(req.body?.room);
  if (!liveActive[room] || typeof identity !== 'string') {
    return res.status(400).json({ error: 'bad request' });
  }
  const cooldown = lastRaiseHandAt[room];
  const last = cooldown.get(identity) ?? 0;
  if (Date.now() - last < RAISE_HAND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'slow down' });
  }
  cooldown.set(identity, Date.now());

  const payload = new TextEncoder().encode(JSON.stringify({ type: 'raise-hand', identity, name }));
  try {
    await roomService.sendData(LIVEKIT_ROOM[room], payload, DataPacket_Kind.RELIABLE, {
      destinationIdentities: [HOST_IDENTITY],
    });
  } catch (err) {
    return res.status(500).json({ error: 'could not reach host' });
  }
  res.json({ ok: true });
});

liveRouter.post('/live/approve', async (req, res) => {
  if (!requireHostSecret(req, res)) return;
  const { identity } = req.body ?? {};
  const room = resolveRoom(req.body?.room);
  if (typeof identity !== 'string') return res.status(400).json({ error: 'identity required' });
  try {
    await roomService.updateParticipant(LIVEKIT_ROOM[room], identity, {
      permission: { canPublish: true, canSubscribe: true, canPublishData: true },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('approve failed:', err);
    res.status(404).json({ error: 'participant not found — may have already left' });
  }
});

liveRouter.post('/live/mute', async (req, res) => {
  if (!requireHostSecret(req, res)) return;
  const { identity, trackSid, muted } = req.body ?? {};
  const room = resolveRoom(req.body?.room);
  if (typeof identity !== 'string' || typeof trackSid !== 'string') {
    return res.status(400).json({ error: 'identity and trackSid required' });
  }
  try {
    await roomService.mutePublishedTrack(LIVEKIT_ROOM[room], identity, trackSid, muted !== false);
    res.json({ ok: true });
  } catch (err) {
    console.error('mute failed:', err);
    res.status(404).json({ error: 'participant or track not found' });
  }
});

liveRouter.post('/live/remove', async (req, res) => {
  if (!requireHostSecret(req, res)) return;
  const { identity } = req.body ?? {};
  const room = resolveRoom(req.body?.room);
  if (typeof identity !== 'string') return res.status(400).json({ error: 'identity required' });
  try {
    await roomService.removeParticipant(LIVEKIT_ROOM[room], identity);
    res.json({ ok: true });
  } catch (err) {
    console.error('remove failed:', err);
    res.status(404).json({ error: 'participant not found — may have already left' });
  }
});
