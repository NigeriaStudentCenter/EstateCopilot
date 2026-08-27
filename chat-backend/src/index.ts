import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { generateGuestName } from './guestNames.js';
import { isMessageAllowed, RateLimiter } from './moderation.js';
import { liveRouter } from './live.js';

// A missing try/catch around one LiveKit call (approving a participant who
// had already disconnected) once took down this whole process — including
// the unrelated text chat — with an unhandled rejection. Every route now
// has its own try/catch, but this is the safety net for whatever the next
// one is: log it, don't let one bad request take the whole server down.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (recovered):', err);
});

const PORT = Number(process.env.PORT) || 4001;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5176')
  .split(',')
  .map((origin) => origin.trim());

// Separate from the live audio room's HOST_SECRET on purpose: chat
// moderation (the pinned topic) can be handed to someone without also
// giving them live-room host control. Unset => the topic feature is inert.
const CHAT_MOD_SECRET = process.env.CHAT_MOD_SECRET ?? '';

const MAX_HISTORY = 50;
const MAX_TOPIC_LEN = 200;

interface ChatMessage {
  id: string;
  name: string;
  text: string;
  at: string;
}

// Separate rooms so the news-page chat and the Student Tools chat are
// distinct conversations. The client picks one via socket.handshake.auth
// .channel; anything not on this list (including the news page, which
// sends nothing) falls back to 'news'. Each room keeps its own rolling
// history.
const CHANNELS = ['news', 'students'] as const;
type Channel = (typeof CHANNELS)[number];
const DEFAULT_CHANNEL: Channel = 'news';

function resolveChannel(raw: unknown): Channel {
  return CHANNELS.includes(raw as Channel) ? (raw as Channel) : DEFAULT_CHANNEL;
}

const historyByChannel = new Map<Channel, ChatMessage[]>(CHANNELS.map((c) => [c, []]));

// One pinned "topic of the moment" per channel, set by a moderator
// (?mod=1 + CHAT_MOD_SECRET). Empty string = nothing pinned. Sent in the
// welcome payload so late joiners see it, and broadcast on change.
const topicByChannel = new Map<Channel, string>(CHANNELS.map((c) => [c, '']));

function isModSecretValid(raw: unknown): boolean {
  return CHAT_MOD_SECRET.length > 0 && typeof raw === 'string' && raw === CHAT_MOD_SECRET;
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
});

app.get('/health', (_req, res) => res.json({ status: 'ok', connected: io.engine.clientsCount }));
app.use(liveRouter);

function broadcastPresence(channel: Channel) {
  const count = io.of('/').adapter.rooms.get(channel)?.size ?? 0;
  io.to(channel).emit('presence', { count });
}

io.on('connection', (socket) => {
  const name = generateGuestName();
  const limiter = new RateLimiter();
  const channel = resolveChannel(socket.handshake.auth?.channel);
  socket.join(channel);

  const history = historyByChannel.get(channel)!;
  socket.emit('welcome', { name, history, topic: topicByChannel.get(channel) ?? '' });
  broadcastPresence(channel);

  // --- Moderator: pinned topic (secret-gated, this socket's channel only) ---
  socket.on('mod:set-topic', (payload: unknown) => {
    const { secret, text } = (payload ?? {}) as { secret?: unknown; text?: unknown };
    if (!isModSecretValid(secret)) {
      socket.emit('mod:result', { ok: false, reason: 'wrong moderator key' });
      return;
    }
    const clean = (typeof text === 'string' ? text : '').trim().slice(0, MAX_TOPIC_LEN);
    topicByChannel.set(channel, clean);
    io.to(channel).emit('topic', { text: clean });
    socket.emit('mod:result', { ok: true });
  });

  socket.on('mod:clear-topic', (payload: unknown) => {
    const { secret } = (payload ?? {}) as { secret?: unknown };
    if (!isModSecretValid(secret)) {
      socket.emit('mod:result', { ok: false, reason: 'wrong moderator key' });
      return;
    }
    topicByChannel.set(channel, '');
    io.to(channel).emit('topic', { text: '' });
    socket.emit('mod:result', { ok: true });
  });

  socket.on('message', (raw: unknown) => {
    const text = typeof raw === 'string' ? raw : '';

    if (!limiter.tryConsume()) {
      socket.emit('rejected', { reason: "you're sending messages too fast" });
      return;
    }

    const check = isMessageAllowed(text);
    if (!check.allowed) {
      socket.emit('rejected', { reason: check.reason });
      return;
    }

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      text: text.trim(),
      at: new Date().toISOString(),
    };
    history.push(message);
    if (history.length > MAX_HISTORY) history.shift();

    io.to(channel).emit('message', message);
  });

  socket.on('disconnect', () => {
    broadcastPresence(channel);
  });
});

server.listen(PORT, () => {
  console.log(`Naija Digest chat backend listening on :${PORT}`);
});
