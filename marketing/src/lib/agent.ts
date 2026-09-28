// Agent marketplace — share-link attribution (for clients) and the agent's own
// dashboard session (for agents). Same API as the rest of the site.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

// ---- Share-link attribution ------------------------------------------------
// A client arriving on ?agent=CODE is "with" that agent for 30 days — the most
// recent agent link they opened wins, since that's the agent they're talking to.
const LINK_KEY = 'estatecopilot_agent';
const LINK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function captureAgentCode(): void {
  try {
    const code = new URLSearchParams(window.location.search).get('agent')?.trim().toUpperCase();
    if (code && /^[A-Z0-9]{4,12}$/.test(code)) {
      localStorage.setItem(LINK_KEY, JSON.stringify({ code, at: Date.now() }));
    }
  } catch {
    /* storage disabled — attribution just won't work */
  }
}

export function getAgentCode(): string | undefined {
  try {
    const raw = localStorage.getItem(LINK_KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { code: string; at: number };
    if (Date.now() - v.at > LINK_MAX_AGE_MS) {
      localStorage.removeItem(LINK_KEY);
      return undefined;
    }
    return v.code;
  } catch {
    return undefined;
  }
}

export function clearAgentCode(): void {
  try {
    localStorage.removeItem(LINK_KEY);
  } catch {
    /* ignore */
  }
}

// ---- Agent session ---------------------------------------------------------
const TOKEN_KEY = 'estatecopilot_agent_token';

export const agentSession = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: any) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const token = auth ? agentSession.get() : null;
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && auth) agentSession.clear();
    throw new ApiError(typeof json?.error === 'string' ? json.error : `Something went wrong (${res.status})`, res.status, json);
  }
  return json as T;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  phone: string;
  agencyName: string | null;
  licenceNumber: string | null;
  states: string[];
  code: string;
  bankAccountName: string | null;
  bankAccountLast4: string | null;
  payoutsConnected: boolean;
  commissionPercent: number;
  stats?: { unreadAlerts: number; openLeads: number; openDeals: number; earned: number };
}

export interface Listing {
  id: string;
  title: string;
  address: string;
  state: string;
  lga: string;
  propertyType: 'LONG_TERM' | 'SHORT_LET';
  rentAmount: number;
  nightlyRate: number | null;
  listingDescription: string | null;
  imageUrls: string[];
  agentFeePercent: number;
  agentFee: number | null;
  shareUrl: string;
  myLeads: number;
  createdAt: string;
}

export interface Lead {
  id: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail: string | null;
  scheduledFor: string;
  status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
  dealStatus: string | null;
  property: { id: string; title: string; lga: string; state: string; rentAmount: number; agentFeePercent: number; propertyType: string };
}

export interface Deal {
  id: string;
  status: 'PENDING_LANDLORD' | 'AWAITING_PAYMENT' | 'PAID' | 'DISPUTED' | 'CANCELLED';
  property?: { id: string; title: string; lga: string; state: string };
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  annualRent: number;
  agentFee: number;
  platformPercent: number;
  platformAmount: number;
  agentAmount: number;
  paymentLink: string | null;
  disputeReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface Alert {
  id: string;
  kind: 'NEW_LISTING' | 'NEW_LEAD' | 'DEAL_UPDATE';
  title: string;
  body: string;
  propertyId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface LandlordDealView {
  id: string;
  status: Deal['status'];
  property: { title: string; address: string; lga: string; state: string };
  agent: { name: string; agencyName: string | null; phone: string };
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  annualRent: number;
  agentFee: number;
}

export const agentApi = {
  register: (d: { name: string; email: string; phone: string; password: string; agencyName?: string; licenceNumber?: string; states: string[] }) =>
    req<{ token: string; agent: Agent }>('POST', '/agent-auth/register', d, false),
  login: (email: string, password: string) => req<{ token: string; agent: Agent }>('POST', '/agent-auth/login', { email, password }, false),
  me: () => req<Agent>('GET', '/agent/me'),
  updateMe: (d: Partial<Pick<Agent, 'name' | 'phone' | 'agencyName' | 'licenceNumber' | 'states'>>) => req<Agent>('PATCH', '/agent/me', d),
  saveBank: (bankCode: string, accountNumber: string) => req<Agent>('POST', '/agent/bank-details', { bankCode, accountNumber }),
  listings: () => req<Listing[]>('GET', '/agent/listings'),
  leads: () => req<Lead[]>('GET', '/agent/leads'),
  updateLead: (id: string, d: { status?: Lead['status']; notes?: string }) => req<Lead>('PATCH', `/agent/leads/${id}`, d),
  deals: () => req<Deal[]>('GET', '/agent/deals'),
  recordDeal: (d: { propertyId: string; bookingId?: string; tenantName: string; tenantEmail: string; tenantPhone: string; annualRent: number; agentFee?: number }) =>
    req<Deal>('POST', '/agent/deals', d),
  cancelDeal: (id: string) => req<Deal>('POST', `/agent/deals/${id}/cancel`),
  alerts: () => req<Alert[]>('GET', '/agent/alerts'),
  readAllAlerts: () => req('POST', '/agent/alerts/read-all'),
  banks: () => req<{ name: string; code: string }[]>('GET', '/public/banks', undefined, false),
  terms: () => req<{ commissionPercent: number }>('GET', '/public/agent-terms', undefined, false),
  byCode: (code: string) => req<{ code: string; name: string; agencyName: string | null }>('GET', `/public/agents/by-code/${encodeURIComponent(code)}`, undefined, false),
  landlordDeal: (token: string) => req<LandlordDealView>('GET', `/public/agent-deals/${encodeURIComponent(token)}`, undefined, false),
  landlordConfirm: (token: string) => req<LandlordDealView>('POST', `/public/agent-deals/${encodeURIComponent(token)}/confirm`, undefined, false),
  landlordDispute: (token: string, reason: string) =>
    req<LandlordDealView>('POST', `/public/agent-deals/${encodeURIComponent(token)}/dispute`, { reason }, false),
};

export const naira = (n: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);
