import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { generateGuestName } from './guestNames.js';
import { isMessageAllowed, RateLimiter } from './moderation.js';

const PORT = Number(process.env.PORT) || 4001;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5176')
  .split(',')
  .map((origin) => origin.trim());

const MAX_HISTORY = 50;

interface ChatMessage {
  id: string;
  name: string;
  text: string;
  at: string;
}

const history: ChatMessage[] = [];

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
});

app.get('/health', (_req, res) => res.json({ status: 'ok', connected: io.engine.clientsCount }));

function broadcastPresence() {
  io.emit('presence', { count: io.engine.clientsCount });
}

io.on('connection', (socket) => {
  const name = generateGuestName();
  const limiter = new RateLimiter();

  socket.emit('welcome', { name, history });
  broadcastPresence();

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

    io.emit('message', message);
  });

  socket.on('disconnect', () => {
    broadcastPresence();
  });
});

server.listen(PORT, () => {
  console.log(`Naija Digest chat backend listening on :${PORT}`);
});
