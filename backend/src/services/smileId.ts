import { env } from '../config/env.js';

export interface NinBvnCheckResult {
  status: 'VERIFIED' | 'FAILED';
  matchedName?: string;
  reason?: string;
}

// Wraps Smile ID's Enhanced KYC endpoint (NIN/BVN identity + face match).
// Docs: https://docs.smileidentity.com
export async function verifyNinBvn(params: {
  nin?: string;
  bvn?: string;
  fullName: string;
}): Promise<NinBvnCheckResult> {
  if (env.mockMode || !env.smileId.apiKey) {
    const looksValid = Boolean(params.nin || params.bvn) && params.fullName.trim().length > 3;
    return looksValid
      ? { status: 'VERIFIED', matchedName: params.fullName }
      : { status: 'FAILED', reason: 'Missing NIN/BVN or name too short' };
  }

  const response = await fetch('https://api.smileidentity.com/v1/id_verification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.smileId.apiKey}`,
    },
    body: JSON.stringify({
      partner_id: env.smileId.partnerId,
      id_number: params.nin ?? params.bvn,
      full_name: params.fullName,
    }),
  });

  if (!response.ok) {
    return { status: 'FAILED', reason: `Smile ID error: ${response.status}` };
  }

  const data = (await response.json()) as { verified: boolean; matched_name?: string };
  return data.verified
    ? { status: 'VERIFIED', matchedName: data.matched_name }
    : { status: 'FAILED', reason: 'No match' };
}
