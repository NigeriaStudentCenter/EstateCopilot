import { env } from '../config/env.js';

// App-only (client credentials) Microsoft Graph access. Every push in this
// file is a best-effort mirror into a SharePoint list — a failure here must
// never break the actual booking/quote/signup flow, so every call is caught
// and logged, never thrown.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const { tenantId, clientId, clientSecret } = env.sharepoint;
  if (!tenantId || !clientId || !clientSecret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) {
    console.error('[sharepoint] token request failed', res.status, await res.text());
    return null;
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

async function pushListItem(listId: string | undefined, fields: Record<string, unknown>): Promise<void> {
  const { siteId } = env.sharepoint;
  if (!siteId || !listId) return; // that particular list isn't configured — silently skip

  try {
    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      console.error('[sharepoint] list item write failed', res.status, await res.text());
    }
  } catch (err) {
    console.error('[sharepoint] mirror failed', err);
  }
}

export async function pushQuotation(data: {
  jobDescription: string;
  propertyTitle?: string;
  handymanName: string;
  handymanPhone: string;
  handymanEmail?: string;
  amount: number;
  message?: string;
}): Promise<void> {
  await pushListItem(env.sharepoint.listIdQuotations, {
    Title: `Quote — ${data.propertyTitle ?? 'Repair job'}`,
    JobDescription: data.jobDescription,
    PropertyTitle: data.propertyTitle ?? '',
    HandymanName: data.handymanName,
    HandymanPhone: data.handymanPhone,
    HandymanEmail: data.handymanEmail ?? '',
    Amount: data.amount,
    Message: data.message ?? '',
    SubmittedAt: new Date().toISOString(),
  });
}

export async function pushHandymanVisitBooking(data: {
  jobDescription: string;
  propertyTitle?: string;
  handymanName: string;
  handymanPhone: string;
  handymanEmail?: string;
  scheduledFor: string;
  message?: string;
}): Promise<void> {
  await pushListItem(env.sharepoint.listIdHandymanVisits, {
    Title: `Site visit — ${data.propertyTitle ?? 'Repair job'}`,
    JobDescription: data.jobDescription,
    PropertyTitle: data.propertyTitle ?? '',
    HandymanName: data.handymanName,
    HandymanPhone: data.handymanPhone,
    HandymanEmail: data.handymanEmail ?? '',
    ScheduledFor: data.scheduledFor,
    Message: data.message ?? '',
    SubmittedAt: new Date().toISOString(),
  });
}

export async function pushPropertyViewingBooking(data: {
  propertyTitle?: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail?: string;
  scheduledFor: string;
  notes?: string;
}): Promise<void> {
  await pushListItem(env.sharepoint.listIdPropertyViewings, {
    Title: `Viewing — ${data.propertyTitle ?? 'Property'}`,
    PropertyTitle: data.propertyTitle ?? '',
    RequesterName: data.requesterName,
    RequesterPhone: data.requesterPhone,
    RequesterEmail: data.requesterEmail ?? '',
    ScheduledFor: data.scheduledFor,
    Notes: data.notes ?? '',
    SubmittedAt: new Date().toISOString(),
  });
}

export async function pushSubscribedLandlord(data: {
  landlordName: string;
  email: string;
  phone?: string;
  state: string; // Nigeria state the landlord registered under — lets state managers filter this list to their own state
  subscriptionStatus: string;
  monthlyAmountNaira: number;
  bankAccountName?: string;
  paystackConnected: boolean;
}): Promise<void> {
  await pushListItem(env.sharepoint.listIdSubscribedLandlords, {
    Title: data.landlordName,
    LandlordName: data.landlordName,
    Email: data.email,
    Phone: data.phone ?? '',
    State: data.state,
    SubscriptionStatus: data.subscriptionStatus,
    MonthlyAmount: data.monthlyAmountNaira,
    BankAccountName: data.bankAccountName ?? '',
    PaystackConnected: data.paystackConnected,
    SubscribedAt: new Date().toISOString(),
  });
}
