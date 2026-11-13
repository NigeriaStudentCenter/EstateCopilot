import { createHash } from 'node:crypto';
import { env } from '../config/env.js';

// Server-to-server client for Kolo's supply module (suppliers who quote on parts requests). Unlike the affiliate
// reporting, failures here are returned to the caller, so the artisan can fall back to the WhatsApp trade desk.

export interface SupplyItem { name: string; spec?: string; qty: number; unit?: string; catalogueId?: string }
export interface CatalogueItem { id: string; name: string; group: string; unit: string; specs: string[] }
export interface SupplyRating { stars: number; onTime: boolean | null; asDescribed: boolean | null; comment: string | null }
export interface SupplyQuote {
  id: string; status: string; totalKobo: number; itemsTotalKobo: number; deliveryFeeKobo: number; etaMinutes: number; complete: boolean; validUntil: string;
  lines: { index: number; available: boolean; unitPriceKobo?: number; note?: string }[]; note: string | null;
  supplier: { id: string; name: string; area: string; rating: number | null; ratingCount: number; contactPhone?: string; address?: string };
}
export interface SupplyOrder { id: string; status: string; amountKobo: number; authorizationUrl: string | null; paidAt: string | null; shippedAt: string | null; releaseAfter: string | null; releasedAt: string | null; disputeNote: string | null }
export interface SupplyRequestView { id: string; status: string; expiresAt: string; escalated: boolean; suppliersAlerted: number; items: SupplyItem[]; acceptedQuoteId: string | null; quotes: SupplyQuote[]; paymentsEnabled: boolean; order: SupplyOrder | null; rating?: SupplyRating | null; canRate?: boolean }

export const supplyConfigured = (): boolean => !env.mockMode && !!env.kolo.baseUrl && !!env.kolo.apiKey;

async function call<T>(method: string, path: string, body?: unknown, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${env.kolo.baseUrl!.replace(/\/$/, '')}/api/supply/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-kolo-key': env.kolo.apiKey! },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new SupplyError(res.status, data?.error ?? `Kolo responded ${res.status}`);
  return data;
}
export class SupplyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// A new request per distinct parts list: re-sending the identical list reuses the open request, an edited list makes a fresh one.
export const externalRefFor = (diagnosisId: string, parts: SupplyItem[]) =>
  `${diagnosisId}-${createHash('sha1').update(JSON.stringify(parts.map((p) => [p.name, p.spec ?? '', p.qty, p.unit ?? '']))).digest('hex').slice(0, 8)}`;

export const createSupplyRequest = (input: { externalRef: string; requesterName: string; requesterPhone: string; state: string; lga: string; jobSummary: string; items: SupplyItem[] }) =>
  call<SupplyRequestView>('POST', '/requests', { source: 'ESTATECOPILOT_ARTISAN', trade: 'PLUMBING', ...input });
export const getSupplyRequest = (id: string) => call<SupplyRequestView>('GET', `/requests/${encodeURIComponent(id)}`);
export const acceptSupplyQuote = (id: string, quoteId: string, returnUrl: string) => call<SupplyRequestView>('POST', `/requests/${encodeURIComponent(id)}/accept`, { quoteId, returnUrl });
export const confirmSupplyOrder = (orderId: string) => call<SupplyOrder>('POST', `/orders/${encodeURIComponent(orderId)}/confirm`);
export const disputeSupplyOrder = (orderId: string, note: string) => call<SupplyOrder>('POST', `/orders/${encodeURIComponent(orderId)}/dispute`, { note });
export const rateSupplyRequest = (id: string, input: { stars: number; onTime?: boolean; asDescribed?: boolean; comment?: string }) => call<SupplyRequestView>('POST', `/requests/${encodeURIComponent(id)}/rating`, input);

// The standard parts list, owned by Kolo so shops and the AI use the same names. Cached for an hour; if Kolo cannot be
// reached the AI simply writes free-text part names as before (and Kolo matches them to the catalogue on arrival).
let catalogueCache: { at: number; items: CatalogueItem[] } | null = null;
export async function getCatalogue(fetchImpl: typeof fetch = fetch): Promise<CatalogueItem[]> {
  if (!supplyConfigured()) return [];
  if (catalogueCache && Date.now() - catalogueCache.at < 3600_000) return catalogueCache.items;
  try {
    const items = await call<CatalogueItem[]>('GET', '/catalogue', undefined, fetchImpl);
    if (Array.isArray(items) && items.length > 0) { catalogueCache = { at: Date.now(), items }; return items; }
  } catch (e) {
    console.warn('[supply] catalogue unavailable', e instanceof Error ? e.message : e);
  }
  return catalogueCache?.items ?? []; // a stale list is better than none
}
export const cancelSupplyRequest = (id: string) => call<{ cancelled: true }>('POST', `/requests/${encodeURIComponent(id)}/cancel`);
