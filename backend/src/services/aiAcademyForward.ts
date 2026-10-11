// AI Academy shares this Paystack account (B.S.O.E LTD), and Paystack allows
// one webhook URL per business — so AI Academy's subscription events arrive
// here. They are passed on, untouched (same raw body and signature), to the
// AI Academy backend, which verifies the signature itself and re-reads the
// subscription from Paystack. EstateCopilot must not process them: a
// charge.success could otherwise be matched to a tenant by email and logged
// as rent.
//
// Settings: AI_ACADEMY_PAYSTACK_PLANS (comma-separated plan codes) and
// optional AI_ACADEMY_WEBHOOK_URL.

import { env } from '../config/env.js';

type PaystackEvent = {
  event?: string;
  data?: {
    metadata?: { product?: string } | string | null;
    plan?: { plan_code?: string } | null;
    subscription?: { plan?: { plan_code?: string } | null } | null;
  };
};

/** Whether a (signature-checked) Paystack event belongs to AI Academy. */
export function isAiAcademyEvent(body: PaystackEvent): boolean {
  const data = body?.data;
  if (!data) return false;
  const meta = typeof data.metadata === 'object' && data.metadata ? data.metadata : null;
  if (meta?.product === 'ai-academy-all-access') return true;
  const plan = data.plan?.plan_code ?? data.subscription?.plan?.plan_code;
  return Boolean(plan && env.aiAcademyPaystack.planCodes.includes(plan));
}

/** Passes the event on unchanged. Throws if AI Academy didn't accept it (so Paystack retries). */
export async function forwardToAiAcademy(rawBody: Buffer, signature: string | undefined): Promise<void> {
  const res = await fetch(env.aiAcademyPaystack.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature ?? '' },
    body: new Uint8Array(rawBody),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`AI Academy webhook returned ${res.status}`);
}
