import { env } from '../config/env.js';
import { verifyNinBvn } from './smileId.js';

// BVN is Critical National Information Infrastructure under CBN rules, and
// storage is restricted to licensed institutions — EstateCopilot is not one.
// So this function is deliberately the ONLY place a tenancy's raw BVN touches:
// it's passed straight to Smile ID (a licensed KYC provider) for a single
// name lookup and is never persisted, logged, or returned to the caller.
// Only the match outcome and a display-safe name come back.
//
// This is a thin adapter over services/smileId.ts::verifyNinBvn so tenant
// vetting (routes/vetting.ts) and tenancy KYC (routes/tenancies.ts) share one
// real verification path.

export interface BvnVerificationResult {
  matched: boolean;
  resolvedName: string;
}

export async function verifyBvn(bvn: string, tenantNameOnFile: string): Promise<BvnVerificationResult> {
  const smileConfigured = Boolean(env.smileId.apiKey && env.smileId.partnerId);

  if (env.mockMode || !smileConfigured) {
    // Mock/demo mode: any BVN ending in an even digit "verifies", so both
    // outcomes are demoable without a real BVN or a KYC charge.
    const matched = Number(bvn[bvn.length - 1]) % 2 === 0;
    return { matched, resolvedName: matched ? tenantNameOnFile : 'Name on file did not match (mock)' };
  }

  const result = await verifyNinBvn({ bvn, fullName: tenantNameOnFile });
  // A service error is "we don't know", not "failed KYC" — throw so the route
  // returns 502 and doesn't persist a FALSE kycStatus:'FAILED'.
  if (result.errored) {
    throw new Error(result.reason ?? 'BVN verification service is unavailable');
  }
  return {
    matched: result.status === 'VERIFIED',
    resolvedName:
      result.matchedName ??
      (result.status === 'VERIFIED' ? tenantNameOnFile : result.reason ?? 'Name on file did not match'),
  };
}
