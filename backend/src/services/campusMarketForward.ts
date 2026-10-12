// Campus Market (the Nigeria Student Center student marketplace, Kolo repo
// market-api) takes payments through this same Paystack business (B.S.O.E LTD).
// Paystack allows one webhook URL per business, so its events arrive here and
// are passed on, untouched (same raw body and signature), exactly like AI
// Academy's. market-api verifies the signature itself and re-checks the
// transaction with Paystack. EstateCopilot must not process them.
//
// Setting: CAMPUS_MARKET_WEBHOOK_URL, e.g.
// https://campus-market-api.azurewebsites.net/api/paystack/webhook. Unset =>
// campus events are acknowledged and dropped (logged), never treated as rent.

import { env } from '../config/env.js';

type PaystackEvent = {
  data?: {
    reference?: string;
    metadata?: { product?: string } | string | null;
  };
};

/** Whether a (signature-checked) Paystack event belongs to Campus Market. */
export function isCampusMarketEvent(body: PaystackEvent): boolean {
  const data = body?.data;
  if (!data) return false;
  const meta = typeof data.metadata === 'object' && data.metadata ? data.metadata : null;
  if (meta?.product === 'campus-market') return true;
  // market-api's references are always CM-<time>-<random>
  return typeof data.reference === 'string' && data.reference.startsWith('CM-');
}

/** Passes the event on unchanged. Returns false when no URL is configured; throws if Campus Market didn't accept it (so Paystack retries). */
export async function forwardToCampusMarket(rawBody: Buffer, signature: string | undefined): Promise<boolean> {
  const url = env.campusMarket.webhookUrl;
  if (!url) return false;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature ?? '' },
    body: new Uint8Array(rawBody),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Campus Market webhook returned ${res.status}`);
  return true;
}
