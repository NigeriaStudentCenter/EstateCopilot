import { createHmac, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export interface NinBvnCheckResult {
  status: 'VERIFIED' | 'FAILED';
  matchedName?: string;
  reason?: string;
  provider: 'smileid' | 'mock';
}

// Smile ID Identity Verification ("id_verification", synchronous Basic KYC).
// Docs: https://docs.usesmileid.com  ·  signature scheme:
//   signature = base64( HMAC_SHA256(apiKey, timestamp + partnerId + "sid_request") )
// Raw NIN/BVN is sent to Smile ID (a licensed KYC provider) for a single
// lookup and is never persisted, logged or returned — only the match outcome
// and a display-safe name come back.

const BASE_URL: Record<string, string> = {
  live: 'https://api.smileidentity.com/v1',
  sandbox: 'https://testapi.smileidentity.com/v1',
};

function smileSignature(timestamp: string): string {
  return createHmac('sha256', env.smileId.apiKey as string)
    .update(timestamp)
    .update(String(env.smileId.partnerId))
    .update('sid_request')
    .digest('base64');
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

export async function verifyNinBvn(params: {
  nin?: string;
  bvn?: string;
  fullName: string;
}): Promise<NinBvnCheckResult> {
  const configured = Boolean(env.smileId.apiKey && env.smileId.partnerId);

  if (env.mockMode || !configured) {
    const looksValid = Boolean(params.nin || params.bvn) && params.fullName.trim().length > 3;
    return looksValid
      ? { status: 'VERIFIED', matchedName: params.fullName, provider: 'mock' }
      : { status: 'FAILED', reason: 'Missing NIN/BVN or name too short', provider: 'mock' };
  }

  const idNumber = params.nin ?? params.bvn;
  if (!idNumber) return { status: 'FAILED', reason: 'No NIN or BVN provided', provider: 'smileid' };

  const idType = params.nin
    ? env.smileId.ninIdType // default NIN_V2
    : env.smileId.bvnIdType; // default BVN
  const timestamp = new Date().toISOString();
  const base = BASE_URL[env.smileId.environment] ?? BASE_URL.live;
  const { first_name, last_name } = splitName(params.fullName);

  let data: {
    ResultCode?: string;
    ResultText?: string;
    Actions?: { Verify_ID_Number?: string; Names?: string; Return_Personal_Info?: string };
    FullName?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
  };
  try {
    const response = await fetch(`${base}/id_verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id: String(env.smileId.partnerId),
        signature: smileSignature(timestamp),
        timestamp,
        country: 'NG',
        id_type: idType,
        id_number: idNumber,
        first_name,
        last_name,
        partner_params: { job_id: randomUUID(), user_id: randomUUID(), job_type: 5 },
      }),
    });
    const text = await response.text();
    data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(`[smileId] ${idType} check HTTP ${response.status}: ${data?.ResultText ?? text.slice(0, 200)}`);
      return {
        status: 'FAILED',
        reason: data?.ResultText ?? `Smile ID error ${response.status}`,
        provider: 'smileid',
      };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[smileId] request failed:', err);
    return { status: 'FAILED', reason: 'Could not reach the ID verification service', provider: 'smileid' };
  }

  const idVerified = data.Actions?.Verify_ID_Number === 'Verified';
  const nameVerdict = data.Actions?.Names ?? 'Not Applicable';
  const matchedName =
    data.FullName ??
    data.full_name ??
    ([data.first_name, data.last_name].filter(Boolean).join(' ') || undefined);

  if (idVerified && nameVerdict !== 'No Match') {
    return { status: 'VERIFIED', matchedName, provider: 'smileid' };
  }
  return {
    status: 'FAILED',
    reason:
      nameVerdict === 'No Match'
        ? 'ID is valid but the name does not match'
        : data.ResultText ?? 'ID could not be verified',
    provider: 'smileid',
  };
}
