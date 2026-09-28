const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `${options?.method ?? 'GET'} ${path} failed: ${res.status}`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getStates: () => request<{ name: string; slug: string; propertyCount: number; jobCount: number }[]>('/api/public/states'),

  getProperties: (state?: string, filters: { stays?: boolean; student?: boolean; unit?: string; near?: string } = {}) => {
    const q = new URLSearchParams();
    if (state) q.set('state', state);
    if (filters.stays) q.set('stays', '1');
    if (filters.student) q.set('student', '1');
    if (filters.unit) q.set('unit', filters.unit);
    if (filters.near) q.set('near', filters.near);
    const qs = q.toString();
    return request<any[]>(`/api/public/properties${qs ? `?${qs}` : ''}`);
  },
  bookPropertyViewing: (
    propertyId: string,
    data: { name: string; phone: string; email?: string; scheduledFor: string; notes?: string; agentCode?: string },
  ) => request(`/api/public/properties/${propertyId}/book-viewing`, { method: 'POST', body: JSON.stringify(data) }),

  getShortLetAvailability: (propertyId: string) =>
    request<{ checkIn: string; checkOut: string }[]>(`/api/public/properties/${propertyId}/short-let-availability`),
  getShortLetQuote: (propertyId: string, checkIn: string, checkOut: string) =>
    request<{ nights: number; rateType: 'NIGHTLY' | 'WEEKLY' | 'MONTHLY'; months: number; weeks: number; extraNights: number; totalAmount: number; studentFriendly: boolean }>(
      `/api/public/properties/${propertyId}/short-let-quote`,
      { method: 'POST', body: JSON.stringify({ checkIn, checkOut }) },
    ),
  // Multipart so a student can attach their student ID card; daily stays
  // send the same form without the file. Every guest gives a BVN or NIN.
  bookShortLet: async (propertyId: string, form: FormData) => {
    const res = await fetch(`${API_BASE}/api/public/properties/${propertyId}/short-let-bookings`, { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body?.error;
      const msg = typeof err === 'string' ? err : Object.values(err?.fieldErrors ?? {}).flat()[0] ?? 'Booking failed — please try again';
      throw new Error(String(msg));
    }
    return body as { bookingId: string; status: 'AWAITING_APPROVAL' | 'PENDING_PAYMENT'; paymentLink: string | null; nights: number; totalAmount: number; rateType: string; idCheck: 'VERIFIED' | 'NOT_CHECKED' };
  },

  // ---- Artisan directory (Phase 2) ----
  getArtisanTrades: () =>
    request<{ trades: { id: string; label: string; group: string; blurb: string }[] }>('/api/public/artisans/meta').then(
      (r) => r.trades,
    ),
  getArtisans: (params: { trade?: string; state?: string; lga?: string; sort?: string }) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    ).toString();
    return request<{ artisans: any[]; total: number }>(`/api/public/artisans${q ? `?${q}` : ''}`);
  },
  getArtisan: (id: string) => request<any>(`/api/public/artisans/${id}`),

  // Marketing WhatsApp opt-in (the checkbox on the lead forms). Best-effort —
  // callers fire this without blocking the main submission.
  captureWhatsAppConsent: (data: {
    phone: string;
    brand?: string;
    source: string;
    optInText?: string;
    marketingOptIn?: boolean;
  }) => request('/api/whatsapp/consent', { method: 'POST', body: JSON.stringify(data) }),
  requestArtisanQuote: (
    id: string,
    data: { name: string; phone: string; role?: string; lga?: string; trade?: string; message: string },
  ) => request<{ ok: true; artisanName: string }>(`/api/public/artisans/${id}/request-quote`, { method: 'POST', body: JSON.stringify(data) }),

  getRepairJobs: (state?: string) => request<any[]>(`/api/public/repair-jobs${state ? `?state=${state}` : ''}`),
  submitQuote: (
    jobId: string,
    data: { handymanName: string; handymanPhone: string; handymanEmail?: string; amount: number; message?: string },
  ) => request(`/api/public/repair-jobs/${jobId}/quote`, { method: 'POST', body: JSON.stringify(data) }),
  bookJobViewing: (
    jobId: string,
    data: { handymanName: string; handymanPhone: string; handymanEmail?: string; scheduledFor: string; message?: string },
  ) => request(`/api/public/repair-jobs/${jobId}/book-viewing`, { method: 'POST', body: JSON.stringify(data) }),

  getLegalRequests: () => request<any[]>('/api/public/legal-requests'),
  submitLegalQuote: (
    requestId: string,
    data: { lawyerName: string; lawyerPhone: string; lawyerEmail?: string; lawFirm?: string; amount: number; message?: string },
  ) => request(`/api/public/legal-requests/${requestId}/quote`, { method: 'POST', body: JSON.stringify(data) }),

  landlordSignup: (data: { name: string; email: string; phone: string; password: string; state: string; ref?: string }) =>
    request<{
      landlordId: string;
      reference: string;
      authorizationUrl: string | null;
      hostedPageUrl: string | null;
      monthlyAmountKobo: number;
    }>('/api/landlord-auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  landlordConfirm: (reference: string, landlordId?: string) =>
    request<{ token: string }>('/api/landlord-auth/confirm', { method: 'POST', body: JSON.stringify({ reference, landlordId }) }),
};
