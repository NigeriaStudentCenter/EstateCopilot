import { env } from '../config/env.js';

export interface BankStatementRiskResult {
  riskScore: number; // 0 (safe) - 100 (high risk)
  averageMonthlyInflow?: number;
  flags: string[];
}

// Wraps Mono's Lookup / Statement Insights product for BVN financial-health checks.
// Docs: https://docs.mono.co
export async function assessBankStatementRisk(bvn: string): Promise<BankStatementRiskResult> {
  if (env.mockMode || !env.mono.secretKey) {
    return { riskScore: 12, averageMonthlyInflow: 450000, flags: [] };
  }

  const response = await fetch(`https://api.withmono.com/v2/lookup/bvn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mono-sec-key': env.mono.secretKey,
    },
    body: JSON.stringify({ bvn }),
  });

  if (!response.ok) {
    return { riskScore: 100, flags: [`Mono lookup failed: ${response.status}`] };
  }

  const data = (await response.json()) as { risk_score?: number; average_inflow?: number };
  return {
    riskScore: data.risk_score ?? 50,
    averageMonthlyInflow: data.average_inflow,
    flags: [],
  };
}
