const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

function getToken(): string | null {
  return localStorage.getItem('ec_tenant_token');
}

export function setToken(token: string) {
  localStorage.setItem('ec_tenant_token', token);
}

export function clearToken() {
  localStorage.removeItem('ec_tenant_token');
}

export function isAuthed(): boolean {
  return !!getToken();
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
  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired — please log in again.');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  signup: (data: { tenancyId: string; name: string; email: string; password: string }) =>
    request<{ token: string }>('/api/tenant-auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ token: string }>('/api/tenant-auth/login', { method: 'POST', body: JSON.stringify(data) }),

  getMe: () => request<any>('/api/tenant/me'),
  getCorrespondence: () => request<any[]>('/api/tenant/correspondence'),
  sendMessage: (body: string) =>
    request('/api/tenant/correspondence', { method: 'POST', body: JSON.stringify({ body, channel: 'PORTAL' }) }),

  getPaymentPlan: () => request<{ plan: string; installments: any[] }>('/api/tenant/payment-plan'),

  getAgreement: () => request<any | null>('/api/tenant/agreement'),
  signAgreement: (fullName: string) =>
    request<any>('/api/tenant/agreement/sign', { method: 'POST', body: JSON.stringify({ fullName, confirmed: true }) }),

  getChecklist: () => request<any[]>('/api/maintenance/checklist'),
  getMaintenance: () => request<any[]>('/api/tenant/maintenance'),
  reportIssue: (description: string, categoryId?: string) =>
    request('/api/tenant/maintenance', { method: 'POST', body: JSON.stringify({ description, categoryId }) }),
};
