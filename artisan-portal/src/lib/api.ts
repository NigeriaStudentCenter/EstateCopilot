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
export interface Credential { id: string; kind: string; status: string; resolvedName?: string; verifiedAt?: string }
export interface WorkSample { id: string; imageUrl: string; caption?: string }
export interface Me {
  id: string; name: string; phone: string; businessName?: string | null; bio?: string | null; photoUrl?: string | null;
  baseState: string; baseLga: string; coverageLgas: string[];
  skillLevel: 'HAND' | 'TRADESMAN' | 'MASTER'; availability: 'OPEN' | 'BUSY' | 'AWAY';
  verificationTier: number; isListed: boolean;
  score: number; ratingAvg: number; ratingCount: number; jobsCompleted: number;
  trades: ArtisanTrade[]; credentials: Credential[]; workSamples: WorkSample[];
}
export interface Job {
  id: string; description: string; categoryLabel: string | null;
  responsibility: string; lga: string | null; state: string | null; createdAt: string; alreadyQuoted: boolean;
}

export const api = {
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

  jobs: () => request<Job[]>('/api/artisan/jobs'),
  quote: (ticketId: string, amount: number, message?: string) =>
    request<unknown>(`/api/artisan/jobs/${ticketId}/quote`, { method: 'POST', body: JSON.stringify({ amount, message }) }),
};
