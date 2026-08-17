import { getToken, clearToken } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  subscriptionStatus?: string;
  constructor(status: number, message: string, subscriptionStatus?: string) {
    super(message);
    this.status = status;
    this.subscriptionStatus = subscriptionStatus;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    let message = `${options?.method ?? 'GET'} ${path} failed: ${res.status}`;
    let subscriptionStatus: string | undefined;
    try {
      const body = await res.json();
      message = body.error ?? message;
      subscriptionStatus = body.subscriptionStatus;
    } catch {
      // non-JSON error body — keep the generic message
    }
    if (res.status === 401) clearToken(); // invalid/expired session — must log in again
    throw new ApiError(res.status, message, subscriptionStatus);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getMe: () =>
    request<{
      id: string;
      name: string;
      email: string;
      state?: string;
      subscriptionStatus: string;
      currentPeriodEnd?: string;
      monthlyAmountKobo: number;
      bankAccountNumber?: string;
      bankAccountName?: string;
      paystackConnected: boolean;
    }>('/api/landlord/me'),
  getStates: () => request<{ name: string; slug: string; propertyCount: number; jobCount: number }[]>('/api/public/states'),
  saveBankDetails: (data: { bankAccountNumber: string; bankCode: string; bankName: string }) =>
    request<{ bankAccountNumber: string; bankAccountName: string; paystackConnected: boolean }>('/api/landlord/bank-details', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; subscriptionStatus: string }>('/api/landlord-auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getProperties: () => request<any[]>('/api/properties'),
  createProperty: (data: {
    title: string;
    address: string;
    state: string;
    lga: string;
    propertyType: 'LONG_TERM' | 'SHORT_LET';
    rentAmount: number;
    cautionDepositAmount: number;
    municipalId?: string;
  }) => request<any>('/api/properties', { method: 'POST', body: JSON.stringify(data) }),
  updateProperty: (propertyId: string, data: { isAdvertised?: boolean; listingDescription?: string; imageUrls?: string[] }) =>
    request(`/api/properties/${propertyId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  inviteTenant: (
    propertyId: string,
    data: { tenantName?: string; tenantPhone: string; rentAmount?: number; leaseStart?: string; leaseEnd?: string },
  ) =>
    request<{ tenancyId: string; inviteUrl: string }>('/api/tenancies/invite', {
      method: 'POST',
      body: JSON.stringify({ propertyId, ...data }),
    }),
  getTenancies: () => request<any[]>('/api/tenancies'),
  sendRentReminder: (tenancyId: string, tenantPhone: string, daysOut: number) =>
    request(`/api/tenancies/${tenancyId}/send-rent-reminder`, {
      method: 'POST',
      body: JSON.stringify({ tenantPhone, daysOut }),
    }),
  getRemindersDue: () => request<any[]>('/api/tenancies/reminders/due'),
  runReminders: () => request<{ remindersSent: number; results: any[] }>('/api/tenancies/reminders/run', { method: 'POST' }),

  getAgreement: (tenancyId: string) => request<any | null>(`/api/tenancies/${tenancyId}/agreement`),
  sendAgreement: (tenancyId: string) => request<any>(`/api/tenancies/${tenancyId}/agreement`, { method: 'POST' }),

  getPaymentPlan: (tenancyId: string) => request<{ plan: string; installments: any[] }>(`/api/tenancies/${tenancyId}/payment-plan`),
  setPaymentPlan: (tenancyId: string, plan: 'FULL' | 'INSTALLMENTS', installmentCount?: number) =>
    request<{ plan: string; installments: any[] }>(`/api/tenancies/${tenancyId}/payment-plan`, {
      method: 'POST',
      body: JSON.stringify({ plan, installmentCount }),
    }),

  getCorrespondence: (tenancyId: string) => request<any[]>(`/api/correspondence/${tenancyId}`),
  addCorrespondence: (tenancyId: string, entry: { channel: string; direction: string; author: string; body: string }) =>
    request(`/api/correspondence/${tenancyId}`, { method: 'POST', body: JSON.stringify(entry) }),

  getAiDrafts: (status?: string) => request<any[]>(`/api/ai-drafts${status ? `?status=${status}` : ''}`),
  approveDraft: (draftId: string, editedBody?: string) =>
    request(`/api/ai-drafts/${draftId}/approve`, { method: 'POST', body: JSON.stringify({ editedBody }) }),
  rejectDraft: (draftId: string) => request(`/api/ai-drafts/${draftId}/reject`, { method: 'POST', body: JSON.stringify({}) }),

  getChecklist: () => request<any[]>('/api/maintenance/checklist'),
  getMaintenanceTickets: () => request<any[]>('/api/maintenance/tickets'),
  createMaintenanceTicket: (ticket: { propertyId: string; propertyTitle?: string; raisedBy?: string; description: string; categoryId?: string }) =>
    request('/api/maintenance/tickets', { method: 'POST', body: JSON.stringify(ticket) }),
  signOffTicket: (ticketId: string, tenantSignedOff: boolean) =>
    request(`/api/maintenance/tickets/${ticketId}/sign-off`, {
      method: 'PATCH',
      body: JSON.stringify({ tenantSignedOff }),
    }),
  setMarketplaceListing: (ticketId: string, openToMarketplace: boolean) =>
    request(`/api/maintenance/tickets/${ticketId}/marketplace`, {
      method: 'PATCH',
      body: JSON.stringify({ openToMarketplace }),
    }),
  getQuotes: (ticketId: string) => request<any[]>(`/api/maintenance/tickets/${ticketId}/quotes`),
  acceptQuote: (quoteId: string) => request(`/api/maintenance/quotes/${quoteId}/accept`, { method: 'PATCH', body: JSON.stringify({}) }),

  getBookings: () => request<any[]>('/api/bookings'),
  setBookingStatus: (bookingId: string, status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED') =>
    request(`/api/bookings/${bookingId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getLegalRequests: () => request<any[]>('/api/legal-requests'),
  createLegalRequest: (data: { propertyId: string; category: string; description: string; raisedBy?: string }) =>
    request('/api/legal-requests', { method: 'POST', body: JSON.stringify(data) }),
  setLegalMarketplaceListing: (requestId: string, openToMarketplace: boolean) =>
    request(`/api/legal-requests/${requestId}/marketplace`, {
      method: 'PATCH',
      body: JSON.stringify({ openToMarketplace }),
    }),
  getLegalQuotes: (requestId: string) => request<any[]>(`/api/legal-requests/${requestId}/quotes`),
  acceptLegalQuote: (quoteId: string) => request(`/api/legal-quotes/${quoteId}/accept`, { method: 'PATCH', body: JSON.stringify({}) }),
};
