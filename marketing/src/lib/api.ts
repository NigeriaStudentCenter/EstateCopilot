const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getProperties: () => request<any[]>('/api/public/properties'),
  bookPropertyViewing: (
    propertyId: string,
    data: { name: string; phone: string; email?: string; scheduledFor: string; notes?: string },
  ) => request(`/api/public/properties/${propertyId}/book-viewing`, { method: 'POST', body: JSON.stringify(data) }),

  getRepairJobs: () => request<any[]>('/api/public/repair-jobs'),
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

  landlordSignup: (data: { name: string; email: string; phone: string; password: string }) =>
    request<{ landlordId: string; reference: string; authorizationUrl: string | null; monthlyAmountKobo: number }>(
      '/api/landlord-auth/signup',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  landlordConfirm: (reference: string, landlordId?: string) =>
    request<{ token: string }>('/api/landlord-auth/confirm', { method: 'POST', body: JSON.stringify({ reference, landlordId }) }),
};
