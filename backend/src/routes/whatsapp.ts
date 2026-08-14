import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

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

    console.log(`[whatsapp:inbound] ${from}: ${body}`);

    if (env.mockMode) {
      // In mock mode we just log — no DB required to see the flow work.
      return;
    }

    await prisma.whatsAppMessage.create({
      data: {
        direction: 'INBOUND',
        fromNumber: from,
        toNumber: change?.metadata?.display_phone_number ?? '',
        body,
        waMessageId,
      },
    });

    // TODO: route `body` through the intent classifier described in the
    // Nigeria roadmap — NIN/BVN submission, guarantor YES/STOP, maintenance
    // report, rent-reminder reply — and dispatch to the matching pillar.
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
  const body = req.body?.Body as string;
  console.log(`[whatsapp:twilio:inbound] ${from}: ${body}`);
  res.type('text/xml').send('<Response></Response>');
});

// Manual send endpoint, useful for testing the outbound path without
// waiting on an inbound trigger (e.g. exercising the rent-reminder copy).
whatsappRouter.post('/webhooks/whatsapp/send-test', async (req, res) => {
  const { to, body } = req.body ?? {};
  if (!to || !body) return res.status(400).json({ error: 'to and body are required' });
  const result = await sendWhatsAppMessage(to, body);
  res.json(result);
});
