import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { sendWhatsAppMessage, sendWhatsAppMedia } from '../services/whatsapp.js';
import { classifyInbound } from '../services/whatsappIntent.js';
import { runMarketingAgent } from '../services/whatsapp/agent.js';
import { recordConsent, recordOptOut } from '../services/whatsapp/consent.js';
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  previewCampaign,
  runCampaign,
  scheduleCampaign,
  cancelSchedule,
} from '../services/whatsapp/campaigns.js';
import {
  listConversations,
  getThread,
  takeoverConversation,
  releaseConversation,
  closeConversation,
  replyAsHuman,
  type WaConversationState,
} from '../services/whatsapp/conversationStore.js';
import type { WaBrand } from '../services/whatsapp/brands.js';

export const whatsappRouter = Router();

// --- Meta Cloud API ---------------------------------------------------
// Step 1 of setup: Meta calls this GET to verify you own the webhook URL.
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
whatsappRouter.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsapp.metaVerifyToken) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

function isValidMetaSignature(req: import('express').Request): boolean {
  if (env.mockMode || !env.whatsapp.metaAppSecret) return true;
  const signature = req.get('x-hub-signature-256');
  if (!signature) return false;
  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', env.whatsapp.metaAppSecret)
      .update((req as any).rawBody ?? JSON.stringify(req.body))
      .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Step 2: Meta POSTs every inbound message (and delivery/read receipts) here.
// This is the single ingestion point for tenant intake, guarantor consent
// replies, rent-reminder replies, and maintenance reports.
whatsappRouter.post('/webhooks/whatsapp', async (req, res) => {
  if (!isValidMetaSignature(req)) {
    return res.sendStatus(401);
  }

  // Always 200 immediately — Meta retries aggressively on non-2xx.
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return; // status/receipt callback, not a message

    const from = message.from as string;
    const body = message.text?.body ?? `[${message.type}]`;
    const waMessageId = message.id as string;
    const displayNumber = change?.metadata?.display_phone_number ?? '';

    console.log(`[whatsapp:inbound] ${from}: ${body}`);

    // Marketing AI agent (opt-in via WA_AGENT_ENABLED). When on, the
    // brand-aware agent (EstateCopilot + AI Academy) owns the reply and the
    // tenant/guarantor-ops classifier below is skipped entirely. Splitting
    // ops and marketing on one number (per keyword / per campaign) is a
    // later step.
    if (env.whatsapp.agentEnabled) {
      await runMarketingAgent({
        from,
        text: body,
        displayNumber,
        waMessageId,
        deliver: env.mockMode
          ? undefined
          : async (reply, attachments) => {
              const sent = await sendWhatsAppMessage(from, reply);
              for (const a of attachments) {
                await sendWhatsAppMedia(from, a.kind, a.link, a.caption);
              }
              return sent;
            },
      });
      return;
    }

    // First hop of the engine: bucket the message so the right pillar can act
    // on it (NIN/BVN submission, guarantor YES/STOP, maintenance report,
    // rent reply). The classifier only ever returns an acknowledgement — no
    // irreversible action is taken here.
    const { intent, confidence, autoReply } = await classifyInbound(body);
    console.log(`[whatsapp:intent] ${from}: ${intent} (${confidence})`);

    if (env.mockMode) {
      // In mock mode we just log — no DB, no outbound send — so the flow is
      // visible end to end without credentials.
      console.log(`[whatsapp:mock-autoreply] -> ${from}: ${autoReply}`);
      return;
    }

    await prisma.whatsAppMessage.create({
      data: { direction: 'INBOUND', fromNumber: from, toNumber: displayNumber, body, waMessageId },
    });

    const sent = await sendWhatsAppMessage(from, autoReply);
    if (sent.sent) {
      await prisma.whatsAppMessage.create({
        data: { direction: 'OUTBOUND', fromNumber: displayNumber, toNumber: from, body: autoReply, waMessageId: sent.id },
      });
    }
  } catch (err) {
    console.error('Failed to process WhatsApp webhook payload', err);
  }
});

// --- Twilio alternative -------------------------------------------------
// Twilio posts application/x-www-form-urlencoded, not JSON, and signs with
// X-Twilio-Signature instead of X-Hub-Signature-256.
// Docs: https://www.twilio.com/docs/whatsapp/api
whatsappRouter.post('/webhooks/whatsapp/twilio', async (req, res) => {
  const from = (req.body?.From as string)?.replace('whatsapp:', '');
  const body = (req.body?.Body as string) ?? '';
  console.log(`[whatsapp:twilio:inbound] ${from}: ${body}`);

  const { intent, confidence, autoReply } = await classifyInbound(body);
  console.log(`[whatsapp:twilio:intent] ${from}: ${intent} (${confidence})`);

  // Twilio replies inline via TwiML — no separate outbound API call needed.
  const escaped = autoReply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  res.type('text/xml').send(`<Response><Message>${escaped}</Message></Response>`);
});

// Manual send endpoint, useful for testing the outbound path without
// waiting on an inbound trigger (e.g. exercising the rent-reminder copy).
whatsappRouter.post('/webhooks/whatsapp/send-test', async (req, res) => {
  const { to, body } = req.body ?? {};
  if (!to || !body) return res.status(400).json({ error: 'to and body are required' });
  const result = await sendWhatsAppMessage(to, body);
  res.json(result);
});

// --- Marketing consent ------------------------------------------------
// The marketing site's lead forms POST here when the "message me on
// WhatsApp" checkbox is ticked. A logged opt-in is required before any
// campaign (business-initiated) message.
whatsappRouter.post('/api/whatsapp/consent', async (req, res) => {
  const { phone, brand, source, optInText, marketingOptIn } = req.body ?? {};
  if (!phone || !source) return res.status(400).json({ error: 'phone and source are required' });
  const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  await recordConsent({ phone, brand, source, optInText, marketingOptIn, ip: fwd || req.ip });
  res.status(201).json({ ok: true });
});

// Explicit opt-out (e.g. an "unsubscribe" link). Inbound STOP replies are
// handled inside the agent.
whatsappRouter.post('/api/whatsapp/opt-out', async (req, res) => {
  const { phone } = req.body ?? {};
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  await recordOptOut(phone);
  res.json({ ok: true });
});

// --- Campaigns ------------------------------------------------------
// Send an approved template to a consented, queried audience. Guarded by the
// shared ADMIN_API_KEY in real mode; open in MOCK_MODE like the rest of the
// app. A large audience should move to a WebJob — runCampaign streams from
// this process for now.
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (env.mockMode) return next();
  if (!env.admin.apiKey) return res.sendStatus(404);
  if (req.get('x-admin-key') !== env.admin.apiKey) return res.status(401).json({ error: 'Bad admin key' });
  next();
}

const audienceQuerySchema = z.object({
  phones: z.array(z.string()).optional(),
  segment: z.enum(['consented', 'artisan_leads', 'tenancies_expiring', 'landlords_no_listing']).optional(),
  brand: z.enum(['ESTATECOPILOT', 'AI_ACADEMY', 'UNKNOWN']).optional(),
  status: z.string().optional(),
  olderThanDays: z.number().int().positive().optional(),
  withinDays: z.number().int().positive().optional(),
  paramFields: z.array(z.string()).max(10).optional(),
});

const campaignSchema = z.object({
  name: z.string().min(2).max(120),
  brand: z.enum(['ESTATECOPILOT', 'AI_ACADEMY', 'UNKNOWN']).optional(),
  templateName: z.string().min(1).max(120),
  templateLang: z.string().min(2).max(10).optional(),
  audienceQuery: audienceQuerySchema,
  scheduleAt: z.string().datetime().optional(),
});

whatsappRouter.post('/api/whatsapp/campaigns', requireAdmin, async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await createCampaign(parsed.data));
});

whatsappRouter.get('/api/whatsapp/campaigns', requireAdmin, async (_req, res) => {
  res.json(await listCampaigns());
});

whatsappRouter.get('/api/whatsapp/campaigns/:id', requireAdmin, async (req, res) => {
  const c = await getCampaign(req.params.id);
  return c ? res.json(c) : res.sendStatus(404);
});

// Dry run — audience size + a small sample, no sends.
whatsappRouter.post('/api/whatsapp/campaigns/:id/preview', requireAdmin, async (req, res) => {
  const p = await previewCampaign(req.params.id);
  return p ? res.json(p) : res.sendStatus(404);
});

whatsappRouter.post('/api/whatsapp/campaigns/:id/send', requireAdmin, async (req, res) => {
  const result = await runCampaign(req.params.id);
  if (!result.started) return res.status(409).json(result);
  res.status(202).json(result);
});

// Queue for a future send — the scheduler fires it when scheduleAt passes.
whatsappRouter.post('/api/whatsapp/campaigns/:id/schedule', requireAdmin, async (req, res) => {
  const at = z.string().datetime().safeParse(req.body?.scheduleAt);
  if (!at.success) return res.status(400).json({ error: 'scheduleAt must be an ISO datetime' });
  const c = await scheduleCampaign(req.params.id, at.data);
  return c ? res.json(c) : res.sendStatus(404);
});

whatsappRouter.post('/api/whatsapp/campaigns/:id/unschedule', requireAdmin, async (req, res) => {
  const c = await cancelSchedule(req.params.id);
  return c ? res.json(c) : res.sendStatus(404);
});

// --- Ops console ----------------------------------------------------
// Human-takeover UI for live conversations. The static page is at
// GET /ops/whatsapp; it drives the JSON endpoints below (admin-key guarded
// in real mode, open in MOCK_MODE).
whatsappRouter.get('/ops/whatsapp', (_req, res) => {
  // This single-file page uses inline <script>/<style>; relax helmet's
  // default CSP for just this response.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
  res.sendFile(path.join(process.cwd(), 'public', 'ops-console.html'));
});

const CONV_STATES = ['AI_ACTIVE', 'HUMAN_ACTIVE', 'AWAITING_OPT_IN', 'CLOSED'] as const;
const CONV_BRANDS = ['ESTATECOPILOT', 'AI_ACADEMY', 'UNKNOWN'] as const;

whatsappRouter.get('/api/whatsapp/ops/conversations', requireAdmin, async (req, res) => {
  const state = CONV_STATES.includes(req.query.state as any) ? (req.query.state as WaConversationState) : undefined;
  const brand = CONV_BRANDS.includes(req.query.brand as any) ? (req.query.brand as WaBrand) : undefined;
  res.json(await listConversations({ state, brand, limit: 200 }));
});

whatsappRouter.get('/api/whatsapp/ops/conversations/:id', requireAdmin, async (req, res) => {
  const t = await getThread(req.params.id);
  return t ? res.json(t) : res.sendStatus(404);
});

whatsappRouter.post('/api/whatsapp/ops/conversations/:id/takeover', requireAdmin, async (req, res) => {
  const ok = await takeoverConversation(req.params.id, String(req.body?.opsName ?? 'ops'));
  return ok ? res.json({ ok: true }) : res.sendStatus(404);
});

whatsappRouter.post('/api/whatsapp/ops/conversations/:id/release', requireAdmin, async (req, res) => {
  const ok = await releaseConversation(req.params.id);
  return ok ? res.json({ ok: true }) : res.sendStatus(404);
});

whatsappRouter.post('/api/whatsapp/ops/conversations/:id/close', requireAdmin, async (req, res) => {
  const ok = await closeConversation(req.params.id);
  return ok ? res.json({ ok: true }) : res.sendStatus(404);
});

whatsappRouter.post('/api/whatsapp/ops/conversations/:id/reply', requireAdmin, async (req, res) => {
  const body = String(req.body?.body ?? '').trim();
  if (!body) return res.status(400).json({ error: 'body is required' });
  const r = await replyAsHuman(req.params.id, body);
  return r.ok ? res.json(r) : res.status(404).json(r);
});

// MOCK_MODE only — drive the marketing agent with a fake inbound message and
// get its reply (and the tools it called, in the logs) without Meta. e.g.
//   curl -XPOST localhost:4000/webhooks/whatsapp/simulate \
//     -H 'content-type: application/json' \
//     -d '{"from":"2348030004444","text":"[EC] 3-bed in Lekki under 8m?"}'
// `brand` optionally forces ESTATECOPILOT | AI_ACADEMY for the first turn.
whatsappRouter.post('/webhooks/whatsapp/simulate', async (req, res) => {
  if (!env.mockMode) return res.sendStatus(404);
  const { from = '2348000000001', text, brand } = req.body ?? {};
  if (!text) return res.status(400).json({ error: 'text is required' });
  const result = await runMarketingAgent({ from, text, brandHint: brand });
  res.json(result);
});
