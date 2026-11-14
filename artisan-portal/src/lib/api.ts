import { getToken, clearToken } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...options,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) clearToken();
    const err = body?.error;
    throw new ApiError(res.status, typeof err === 'string' ? err : `${options?.method ?? 'GET'} ${path} failed (${res.status})`);
  }
  return body as T;
}

// ---- types ----
export type TradeGroup = 'STRUCTURAL' | 'SYSTEMS';
export interface TradeDef { id: string; label: string; group: TradeGroup; blurb: string }
export interface StateDef { name: string; slug: string; lgas: string[] }
export interface ArtisanTrade { id: string; trade: string; yearsExperience: number; isPrimary: boolean }
export interface Certificate { certificateId: string; course: string; courseTitle: string; holderName: string; issuedAt: string; nameMatched: boolean; url: string }
export interface Credential { id: string; kind: string; status: string; resolvedName?: string; verifiedAt?: string }
export interface WorkSample { id: string; imageUrl: string; caption?: string }
export interface Me {
  id: string; name: string; phone: string; businessName?: string | null; bio?: string | null; photoUrl?: string | null;
  baseState: string; baseLga: string; coverageLgas: string[];
  skillLevel: 'HAND' | 'TRADESMAN' | 'MASTER'; availability: 'OPEN' | 'BUSY' | 'AWAY';
  verificationTier: number; isListed: boolean;
  score: number; ratingAvg: number; ratingCount: number; jobsCompleted: number;
  trades: ArtisanTrade[]; credentials: Credential[]; workSamples: WorkSample[];
  bankAccountName?: string | null; bankAccountNumber?: string | null; paystackSubaccountCode?: string | null;
  certificates?: Certificate[]; certified?: boolean;
}
export interface DiagnosisPart { name: string; spec?: string; qty: number; unit?: string; note?: string; catalogueId?: string }
export interface Diagnosis {
  id: string; createdAt: string; note: string | null; photoCount: number; partsRequestedAt: string | null;
  outcome: 'DIAGNOSED' | 'NEEDS_MORE_PHOTOS' | 'NOT_PLUMBING' | 'NOT_ELECTRICAL' | 'NOT_CARPENTRY' | 'NOT_SOLAR' | 'NOT_BUILDING' | 'NOT_HVAC';
  trade?: 'PLUMBING' | 'ELECTRICAL' | 'CARPENTRY' | 'SOLAR' | 'BUILDING' | 'HVAC'; checks?: string[];
  summary: string; summaryPidgin?: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  fixture: string; material?: string; defect: string; alternativeCauses: string[];
  urgency: 'URGENT' | 'SOON' | 'ROUTINE'; immediateAction?: string;
  safety: { level: 'NORMAL' | 'CAUTION' | 'STOP'; warnings: string[]; escalate: boolean };
  tools: string[]; parts: DiagnosisPart[]; steps: string[]; estimatedMinutes?: number; photoRequests: string[];
  supplyRequestId?: string | null;
}
export interface SupplierQuote {
  id: string; status: string; totalKobo: number; itemsTotalKobo: number; deliveryFeeKobo: number; etaMinutes: number; complete: boolean; validUntil: string;
  lines: { index: number; available: boolean; unitPriceKobo?: number }[]; note: string | null;
  supplier: { id: string; name: string; area: string; rating: number | null; ratingCount: number; contactPhone?: string; address?: string };
}
export interface SupplyOrder { id: string; status: 'AWAITING_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'RELEASED' | 'DISPUTED' | 'REFUNDED' | 'EXPIRED'; amountKobo: number; authorizationUrl: string | null; paidAt: string | null; shippedAt: string | null; releaseAfter: string | null; releasedAt: string | null; disputeNote: string | null }
export interface SupplyRating { stars: number; onTime: boolean | null; asDescribed: boolean | null; comment: string | null }
export interface SupplyState { rating?: SupplyRating | null; canRate?: boolean; paymentsEnabled?: boolean; order?: SupplyOrder | null; requestId: string; status: string; expiresAt: string; escalated: boolean; suppliersAlerted: number; acceptedQuoteId: string | null; items: { name: string; spec?: string; qty: number; unit?: string }[]; quotes: SupplierQuote[] }
export interface DiagnosisCard {
  id: string; createdAt: string; summary: string; outcome: Diagnosis['outcome']; confidence: Diagnosis['confidence'];
  urgency: Diagnosis['urgency']; safetyLevel: 'NORMAL' | 'CAUTION' | 'STOP'; partsRequestedAt: string | null;
}
export interface JobPayment {
  id: string; job: string; amount: number; artisanAmount: number; platformAmount: number;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'CANCELLED'; payoutMethod: 'split' | 'manual' | null; paidAt: string | null; createdAt: string;
}
export interface Job {
  id: string; description: string; categoryLabel: string | null;
  responsibility: string; lga: string | null; state: string | null; createdAt: string; alreadyQuoted: boolean;
}
export type LeadStatus = 'NEW' | 'CONTACTED' | 'CLOSED';
export interface Lead {
  id: string; requesterName: string; requesterPhone: string; requesterRole: string | null;
  lga: string | null; trade: string | null; tradeLabel: string | null;
  message: string; status: LeadStatus; createdAt: string;
}

export interface Dashboard {
  name: string;
  status: { availability: 'OPEN' | 'BUSY' | 'AWAY'; listed: boolean };
  verification: { tier: number; label: string; certified: boolean; idVerified: boolean };
  ratings: { average: number | null; count: number };
  jobs: { receivedThisMonth: number; receivedTotal: number; newRequests: number; requestsThisMonth: number; wonThisMonth: number; completedTotal: number };
  earnings: { monthLabel: string; thisMonth: number; paidJobsThisMonth: number; pending: number; allTime: number };
}

export interface LabelReading { readable: boolean; name: string | null; watts: number | null; source: 'label' | 'volts x amps' | 'VA' | null; volts: number | null; amps: number | null; note: string | null }

export type DiagnosisTradeId = 'PLUMBING' | 'ELECTRICAL' | 'CARPENTRY' | 'SOLAR' | 'BUILDING' | 'HVAC';
export interface DiagnoseTrade { id: DiagnosisTradeId; label: string; icon: string; intro: string; notice: string | null; beta: boolean; available: boolean; reason: string | null }

export const api = {
  diagnoseTrades: () => request<{ trades: DiagnoseTrade[] }>('/api/artisan/me/diagnose-trades'),
  dashboard: () => request<Dashboard>('/api/artisan/me/dashboard'),
  banks: () => request<{ name: string; code: string }[]>('/api/public/banks'),
  saveBank: (bankCode: string, accountNumber: string) =>
    request<{ bankAccountName: string; bankAccountLast4: string; payoutsConnected: true }>('/api/artisan/me/bank-details', {
      method: 'POST',
      body: JSON.stringify({ bankCode, accountNumber }),
    }),
  payments: () => request<{ commissionPercent: number; payments: JobPayment[] }>('/api/artisan/payments'),
  trades: () => request<TradeDef[]>('/api/artisan-meta/trades'),
  states: () => request<StateDef[]>('/api/artisan-meta/states'),

  requestOtp: (phone: string) =>
    request<{ sent: true; devOtp?: string }>('/api/artisan-auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (input: { phone: string; code: string; name?: string; state?: string; lga?: string }) =>
    request<{ token: string; isNew: boolean }>('/api/artisan-auth/otp/verify', { method: 'POST', body: JSON.stringify(input) }),

  me: () => request<Me>('/api/artisan/me'),
  updateMe: (patch: Partial<Pick<Me, 'name' | 'businessName' | 'bio' | 'photoUrl' | 'baseState' | 'baseLga' | 'coverageLgas' | 'availability' | 'skillLevel'>>) =>
    request<Me>('/api/artisan/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  setTrades: (trades: { trade: string; yearsExperience: number; isPrimary: boolean }[]) =>
    request<ArtisanTrade[]>('/api/artisan/me/trades', { method: 'PUT', body: JSON.stringify({ trades }) }),
  verifyId: (kind: 'NIN' | 'BVN', idNumber: string) =>
    request<{ status: string; verificationTier: number; isListed: boolean; resolvedName?: string }>(
      '/api/artisan/me/verify',
      { method: 'POST', body: JSON.stringify({ kind, idNumber }) },
    ),

  uploadWorkSamples: async (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('images', f, f.name));
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/artisan/me/work-samples`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401) clearToken();
      throw new ApiError(res.status, body?.error ?? `Upload failed (${res.status})`);
    }
    return body as WorkSample[];
  },
  deleteWorkSample: (url: string) =>
    request<WorkSample[]>('/api/artisan/me/work-samples', { method: 'DELETE', body: JSON.stringify({ url }) }),

  linkCertificate: (certificateId: string) =>
    request<{ certificate?: Certificate; certified: boolean; idVerified: boolean; verificationTier: number; message: string }>('/api/artisan/me/certificates', {
      method: 'POST',
      body: JSON.stringify({ certificateId }),
    }),

  diagnose: async (files: File[], note: string, trade: DiagnosisTradeId = 'PLUMBING') => {
    const form = new FormData();
    files.forEach((f) => form.append('images', f, f.name));
    if (note.trim()) form.append('note', note.trim());
    form.append('trade', trade);
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/artisan/me/diagnose`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401) clearToken();
      throw new ApiError(res.status, body?.error ?? `Diagnosis failed (${res.status})`);
    }
    return body as Diagnosis;
  },
  scanLabel: async (file: File) => {
    const form = new FormData();
    form.append('image', file, file.name);
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/artisan/me/solar/scan-label`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401) clearToken();
      throw new ApiError(res.status, body?.error ?? `Label scan failed (${res.status})`);
    }
    return body as LabelReading;
  },
  diagnoses: () => request<DiagnosisCard[]>('/api/artisan/me/diagnoses'),
  diagnosis: (id: string) => request<Diagnosis>(`/api/artisan/me/diagnoses/${id}`),
  partsRequest: (id: string, parts?: DiagnosisPart[]) =>
    request<{ message: string; whatsappUrl: string; tradeDesk: string; parts: DiagnosisPart[]; supply: { requestId: string; suppliersAlerted: number; escalated: boolean } | null }>(`/api/artisan/me/diagnoses/${id}/parts-request`, {
      method: 'POST',
      body: JSON.stringify(parts ? { parts: parts.map((p) => ({ name: p.name, spec: p.spec, qty: p.qty, unit: p.unit })) } : {}),
    }),

  quotes: (id: string) => request<{ supply: SupplyState | null }>(`/api/artisan/me/diagnoses/${id}/quotes`),
  acceptQuote: (id: string, quoteId: string) => request<{ supply: SupplyState }>(`/api/artisan/me/diagnoses/${id}/quotes/${quoteId}/accept`, { method: 'POST' }),

  rateSupplier: (id: string, body: { stars: number; onTime?: boolean; asDescribed?: boolean; comment?: string }) => request<{ supply: SupplyState }>(`/api/artisan/me/diagnoses/${id}/rating`, { method: 'POST', body: JSON.stringify(body) }),
  confirmOrder: (id: string) => request<{ order: SupplyOrder }>(`/api/artisan/me/diagnoses/${id}/order/confirm`, { method: 'POST' }),
  disputeOrder: (id: string, note: string) => request<{ order: SupplyOrder }>(`/api/artisan/me/diagnoses/${id}/order/dispute`, { method: 'POST', body: JSON.stringify({ note }) }),

  jobs: () => request<Job[]>('/api/artisan/jobs'),
  quote: (ticketId: string, amount: number, message?: string) =>
    request<unknown>(`/api/artisan/jobs/${ticketId}/quote`, { method: 'POST', body: JSON.stringify({ amount, message }) }),

  leads: () => request<Lead[]>('/api/artisan/leads'),
  updateLead: (id: string, status: LeadStatus) =>
    request<Lead>(`/api/artisan/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
