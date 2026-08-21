import { env } from '../config/env.js';

// BVN is Critical National Information Infrastructure under CBN rules, and
// storage is restricted to licensed financial institutions — EstateCopilot
// is not one. So this function is deliberately the ONLY place the raw BVN
// ever touches: it's passed through to Paystack (which is licensed) for a
// single lookup and never persisted, logged, or returned to the caller.
// Only the match outcome and a display-safe name are returned.

export interface BvnVerificationResult {
  matched: boolean;
  resolvedName: string;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// A tenant's name on file is one free-text string ("Chidi Okonkwo"), while
// Paystack returns first/last name separately — so "matched" means both
// resolved name parts appear somewhere in the name on file, not an exact
// string match (handles middle names, reordering, etc. without being so
// loose it'd pass a genuinely different person).
function namesMatch(onFile: string, firstName: string, lastName: string): boolean {
  const normalizedOnFile = normalize(onFile);
  return normalizedOnFile.includes(normalize(firstName)) && normalizedOnFile.includes(normalize(lastName));
}

export async function verifyBvn(bvn: string, tenantNameOnFile: string): Promise<BvnVerificationResult> {
  if (env.mockMode || !env.paystack.secretKey) {
    // Mock/demo mode: any BVN ending in an even digit "verifies" so the flow
    // is demoable without a real BVN or Paystack charge.
    const matched = Number(bvn[bvn.length - 1]) % 2 === 0;
    return { matched, resolvedName: matched ? tenantNameOnFile : 'Name on file did not match (mock)' };
  }

  const response = await fetch(`https://api.paystack.co/bank/resolve_bvn/${bvn}`, {
    headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
  });
  if (!response.ok) {
    throw new Error(`Could not verify that BVN (${response.status})`);
  }
  const body = (await response.json()) as { data: { first_name: string; last_name: string } };
  const { first_name, last_name } = body.data;
  const matched = namesMatch(tenantNameOnFile, first_name, last_name);
  return { matched, resolvedName: `${first_name} ${last_name}` };
}
