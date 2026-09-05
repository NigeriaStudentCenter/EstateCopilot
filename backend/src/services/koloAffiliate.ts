import { env } from '../config/env.js';

// Best-effort outbound report to the Kolo affiliate platform. Same rules as
// services/sharepoint.ts: every call is caught and logged, never thrown — a
// Kolo outage must not stop a landlord from activating their subscription.
//
// Kolo dedupes on (programId, externalRef), so it is always safe to call this
// more than once for the same landlord/payment (e.g. confirm + a later admin
// re-activation): the first call creates the commission, the rest are no-ops.

interface ReportLandlordConversionInput {
  referralCode?: string; // the ?ref= captured at signup; nothing to report without it
  landlordId: string;
  amountKobo: number;
  eventType?: 'SIGNUP' | 'PURCHASE' | 'RENEWAL' | 'LEAD';
}

export async function reportLandlordConversion({
  referralCode,
  landlordId,
  amountKobo,
  eventType = 'PURCHASE',
}: ReportLandlordConversionInput): Promise<void> {
  if (!referralCode) return; // organic signup — nobody to attribute it to
  const { baseUrl, apiKey, programId } = env.kolo;
  if (!baseUrl || !apiKey) return; // Kolo not wired up in this environment

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/conversions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kolo-key': apiKey },
      body: JSON.stringify({
        programId,
        ref: referralCode,
        eventType,
        orderValueKobo: amountKobo,
        // One commission per landlord's first subscription payment. Keyed by
        // landlordId so retries and re-activations never double-count.
        externalRef: `landlord_${landlordId}`,
      }),
    });
    if (!res.ok) {
      console.warn(`[kolo] conversion report for landlord ${landlordId} responded ${res.status}`);
    }
  } catch (err) {
    console.warn(`[kolo] conversion report for landlord ${landlordId} failed:`, (err as Error).message);
  }
}
