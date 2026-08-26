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
import { Router } from 'express';
import { AccessToken, RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'https://live.nigeriastudentambassador.com';
const LIVEKIT_WS_URL = LIVEKIT_URL.replace(/^https/, 'wss');
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
const HOST_SECRET = process.env.HOST_SECRET ?? '';
const ROOM_NAME = 'naija-digest-live';
const HOST_IDENTITY = 'host';

const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

let liveActive = false;

// A raise-hand per identity every few seconds is plenty — this is the
// "basic per-identity cooldown" the plan flagged as the only spam guard
// for this endpoint in v1.
const lastRaiseHandAt = new Map<string, number>();
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

liveRouter.get('/live/status', (_req, res) => {
  res.json({ live: liveActive, roomName: ROOM_NAME });
});

liveRouter.post('/live/host/start', async (req, res) => {
  if (!requireHostSecret(req, res)) return;
  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: HOST_IDENTITY });
    token.addGrant({
      room: ROOM_NAME,
      roomJoin: true,
      roomAdmin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const jwt = await token.toJwt();
    liveActive = true;
    res.json({ token: jwt, url: LIVEKIT_WS_URL, identity: HOST_IDENTITY });
  } catch (err) {
    console.error('host/start failed:', err);
    res.status(500).json({ error: 'could not start' });
  }
});

liveRouter.post('/live/host/end', async (req, res) => {
  if (!requireHostSecret(req, res)) return;
  liveActive = false;
  try {
    await roomService.deleteRoom(ROOM_NAME);
  } catch {
    // Room may not exist if nobody ever joined — not an error worth surfacing.
  }
  res.json({ ok: true });
});

liveRouter.post('/live/join', async (_req, res) => {
  if (!liveActive) return res.status(409).json({ error: 'not live right now' });
  try {
    const identity = `guest-${Math.random().toString(36).slice(2, 9)}`;
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity });
    token.addGrant({
      room: ROOM_NAME,
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
      canPublishData: true,
    });
    res.json({ token: await token.toJwt(), url: LIVEKIT_WS_URL, identity });
  } catch (err) {
    console.error('join failed:', err);
    res.status(500).json({ error: 'could not join' });
  }
});

liveRouter.post('/live/raise-hand', async (req, res) => {
  const { identity, name } = req.body ?? {};
  if (!liveActive || typeof identity !== 'string') {
    return res.status(400).json({ error: 'bad request' });
  }
  const last = lastRaiseHandAt.get(identity) ?? 0;
  if (Date.now() - last < RAISE_HAND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'slow down' });
  }
  lastRaiseHandAt.set(identity, Date.now());

  const payload = new TextEncoder().encode(JSON.stringify({ type: 'raise-hand', identity, name }));
  try {
    await roomService.sendData(ROOM_NAME, payload, DataPacket_Kind.RELIABLE, {
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
  if (typeof identity !== 'string') return res.status(400).json({ error: 'identity required' });
  try {
    await roomService.updateParticipant(ROOM_NAME, identity, {
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
  if (typeof identity !== 'string' || typeof trackSid !== 'string') {
    return res.status(400).json({ error: 'identity and trackSid required' });
  }
  try {
    await roomService.mutePublishedTrack(ROOM_NAME, identity, trackSid, muted !== false);
    res.json({ ok: true });
  } catch (err) {
    console.error('mute failed:', err);
    res.status(404).json({ error: 'participant or track not found' });
  }
});

liveRouter.post('/live/remove', async (req, res) => {
  if (!requireHostSecret(req, res)) return;
  const { identity } = req.body ?? {};
  if (typeof identity !== 'string') return res.status(400).json({ error: 'identity required' });
  try {
    await roomService.removeParticipant(ROOM_NAME, identity);
    res.json({ ok: true });
  } catch (err) {
    console.error('remove failed:', err);
    res.status(404).json({ error: 'participant not found — may have already left' });
  }
});
