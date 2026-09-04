import { env } from '../config/env.js';

// The buckets an inbound WhatsApp message can fall into. This is the first
// hop of the WhatsApp engine — it decides which pillar a message belongs to
// so a human (or a later automation) can act on it. It never takes an
// irreversible action itself; the only thing it produces is a plain-text
// acknowledgement to send back.
export type WhatsAppIntent =
  | 'IDENTITY_SUBMISSION' // an 11-digit NIN or BVN pasted in
  | 'GUARANTOR_CONSENT' // "YES" / "I agree" to a guarantor request
  | 'GUARANTOR_DECLINE' // "STOP" / "NO" to a guarantor request
  | 'MAINTENANCE_REPORT' // something is broken / leaking / not working
  | 'RENT_REPLY' // a reply about rent, a transfer, a receipt
  | 'GREETING' // "hello" with nothing else actionable
  | 'UNKNOWN';

export interface IntentResult {
  intent: WhatsAppIntent;
  confidence: 'high' | 'low';
  /** Present only for IDENTITY_SUBMISSION — the 11 digits we spotted. */
  identityNumber?: string;
  /** A receipt to send back to the sender. Never an action, just an ack. */
  autoReply: string;
}

const ACK: Record<WhatsAppIntent, string> = {
  IDENTITY_SUBMISSION:
    'Thanks — we have received your 11-digit number and will run the verification. You will get a confirmation here shortly.',
  GUARANTOR_CONSENT: 'Thank you for confirming. Your consent has been recorded.',
  GUARANTOR_DECLINE:
    'Understood — we have recorded that you do not consent, and you will not be contacted about this request again.',
  MAINTENANCE_REPORT:
    'Thanks for reporting this. It has been logged and the property manager will follow up. Reply with a photo if you have one.',
  RENT_REPLY: 'Thanks — your message about rent has been passed to your landlord, who will confirm and follow up.',
  GREETING:
    'Hello! You can use this number to submit an ID for verification, respond to a guarantor request, report a repair, or ask about rent.',
  UNKNOWN: 'Thanks for your message — it has been logged and someone will get back to you.',
};

function ruleClassify(raw: string): IntentResult {
  const text = raw.trim();
  const lower = text.toLowerCase();

  // An 11-digit run (NIN and BVN are both 11 digits). Tolerate spaces/dashes.
  const digits = text.replace(/[\s-]/g, '');
  const idMatch = digits.match(/(?<!\d)(\d{11})(?!\d)/);
  if (idMatch) {
    return { intent: 'IDENTITY_SUBMISSION', confidence: 'high', identityNumber: idMatch[1], autoReply: ACK.IDENTITY_SUBMISSION };
  }

  if (/^(stop|no|nope|decline|refuse|opt[\s-]?out|unsubscribe|i do not consent|i don't consent)\b/.test(lower)) {
    return { intent: 'GUARANTOR_DECLINE', confidence: 'high', autoReply: ACK.GUARANTOR_DECLINE };
  }
  if (/^(yes|yeah|yep|i agree|agreed|i consent|consent|accept|confirmed?)\b/.test(lower)) {
    return { intent: 'GUARANTOR_CONSENT', confidence: 'high', autoReply: ACK.GUARANTOR_CONSENT };
  }

  if (/\b(leak|leaking|broken|not working|no light|no power|generator|gen\b|water|plumb|toilet|pipe|electric|wiring|socket|fault|repair|fix|damage|ac\b|air ?con|ceiling|roof|burst)\b/.test(lower)) {
    return { intent: 'MAINTENANCE_REPORT', confidence: 'high', autoReply: ACK.MAINTENANCE_REPORT };
  }

  if (/\b(rent|paid|payment|transfer|transferred|sent the money|receipt|deposit|installment|instalment|owing|balance)\b/.test(lower)) {
    return { intent: 'RENT_REPLY', confidence: 'high', autoReply: ACK.RENT_REPLY };
  }

  if (/^(hi|hey|hello|good (morning|afternoon|evening)|greetings)\b/.test(lower) && text.length < 40) {
    return { intent: 'GREETING', confidence: 'high', autoReply: ACK.GREETING };
  }

  return { intent: 'UNKNOWN', confidence: 'low', autoReply: ACK.UNKNOWN };
}

const CLAUDE_LABELS: WhatsAppIntent[] = [
  'IDENTITY_SUBMISSION',
  'GUARANTOR_CONSENT',
  'GUARANTOR_DECLINE',
  'MAINTENANCE_REPORT',
  'RENT_REPLY',
  'GREETING',
  'UNKNOWN',
];

// When a key is available and the rules weren't confident, ask Claude to pick
// a label. Same call shape as services/aiReply.ts. Any failure => keep the
// rule result; the engine must never block on an AI outage.
async function claudeRefine(body: string, fallback: IntentResult): Promise<IntentResult> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ai.anthropicApiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 20,
        system:
          'You classify a single inbound WhatsApp message from a Nigerian residential tenant or guarantor. ' +
          `Reply with exactly one of these labels and nothing else: ${CLAUDE_LABELS.join(', ')}.`,
        messages: [{ role: 'user', content: body.slice(0, 500) }],
      }),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { content: { type: string; text?: string }[] };
    const label = data.content.find((c) => c.type === 'text')?.text?.trim().toUpperCase().replace(/[^A-Z_]/g, '');
    const match = CLAUDE_LABELS.find((l) => l === label);
    if (!match) return fallback;
    return { intent: match, confidence: 'high', identityNumber: fallback.identityNumber, autoReply: ACK[match] };
  } catch {
    return fallback;
  }
}

export async function classifyInbound(body: string): Promise<IntentResult> {
  const ruleResult = ruleClassify(body);
  if (ruleResult.confidence === 'high' || env.mockMode || !env.ai.anthropicApiKey) {
    return ruleResult;
  }
  return claudeRefine(body, ruleResult);
}
