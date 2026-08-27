import express from 'express';
import cors from 'cors';
import { RateLimiter } from './ratelimit.js';
import type { Provider, RunRequest, Tier } from './providers/types.js';
import { createAnthropicProvider } from './providers/anthropic.js';

// Same safety net as the chat backend: one bad request must never take the
// whole process down. Log and carry on.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (recovered):', err);
});

const PORT = Number(process.env.PORT) || 4002;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5176')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR) || 8;

// Provider selection — the one place the model vendor is chosen. A future
// "gemini" module implements the same Provider interface and slots in here.
const PROVIDER_NAME = (process.env.PROVIDER || 'anthropic').toLowerCase();
let provider: Provider;
switch (PROVIDER_NAME) {
  case 'anthropic':
    provider = createAnthropicProvider();
    break;
  default:
    throw new Error(`Unknown PROVIDER "${PROVIDER_NAME}" — only "anthropic" is implemented`);
}

const limiter = new RateLimiter(RATE_LIMIT_PER_HOUR);

const app = express();
app.set('trust proxy', 1); // App Service sits behind a proxy; use X-Forwarded-For
app.use(cors({ origin: ALLOWED_ORIGINS }));
// Briefs (PDF/image) arrive base64 inside the message list, so the body
// can be a few MB. Anthropic's own request cap is 32MB; stay well under.
app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: PROVIDER_NAME, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

const VALID_TIERS: Tier[] = ['smart', 'fast'];
const MAX_MESSAGES = 12;

const KEY_REQUIRED = PROVIDER_NAME === 'anthropic';

app.post('/run', async (req, res) => {
  if (KEY_REQUIRED && !process.env.ANTHROPIC_API_KEY) {
    console.error('run refused: ANTHROPIC_API_KEY is not set');
    return res.status(503).json({ error: 'The service is not configured yet — no API key set.' });
  }

  const ip = req.ip || 'unknown';
  if (!limiter.tryConsume(ip)) {
    return res.status(429).json({ error: "You've used this a lot in a short time — try again in a little while." });
  }

  const body = req.body ?? {};
  const tier: Tier = VALID_TIERS.includes(body.tier) ? body.tier : 'fast';
  const web = body.web !== false; // default on — every student tool uses search
  const messages = body.messages;

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: 'Bad request: "messages" must be a non-empty array.' });
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object' || (m.role !== 'user' && m.role !== 'assistant')) {
      return res.status(400).json({ error: 'Bad request: each message needs role "user" or "assistant".' });
    }
  }

  const runReq: RunRequest = { tier, messages, web };

  try {
    const { text } = await provider.run(runReq);
    if (!text) {
      return res.status(502).json({ error: 'The model returned an empty response — please try again.' });
    }
    res.json({ text });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    const msg = (err as { message?: string })?.message || 'Unknown error';
    console.error('run failed:', status ?? '', msg);
    if (status === 401 || status === 403) {
      return res.status(500).json({ error: 'The service is not configured correctly (auth).' });
    }
    if (status === 429) {
      return res.status(503).json({ error: 'The AI service is busy right now — please try again shortly.' });
    }
    res.status(502).json({ error: 'Could not complete the request — please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`student-agents-api listening on :${PORT} (provider: ${PROVIDER_NAME})`);
});
