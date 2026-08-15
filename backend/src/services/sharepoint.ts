import { env } from '../config/env.js';

// App-only (client credentials) Microsoft Graph access, scoped to a single
// SharePoint list. Best-effort mirror only — a failure here must never break
// the actual quote/visit-request flow, so every call is caught and logged,
// never thrown.

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

interface ArtisanRequestFields {
  requestType: 'Quote' | 'Site Visit';
  jobDescription: string;
  propertyTitle?: string;
  handymanName: string;
  handymanPhone: string;
  handymanEmail?: string;
  amount?: number;
  scheduledFor?: string;
  message?: string;
}

export async function pushArtisanRequestToSharePoint(data: ArtisanRequestFields): Promise<void> {
  const { siteId, listId } = env.sharepoint;
  if (!siteId || !listId) return; // integration not configured — silently skip

  try {
    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          Title: `${data.requestType} — ${data.propertyTitle ?? 'Repair job'}`,
          RequestType: data.requestType,
          JobDescription: data.jobDescription,
          PropertyTitle: data.propertyTitle ?? '',
          HandymanName: data.handymanName,
          HandymanPhone: data.handymanPhone,
          HandymanEmail: data.handymanEmail ?? '',
          Amount: data.amount ?? null,
          ScheduledFor: data.scheduledFor ?? null,
          Message: data.message ?? '',
          SubmittedAt: new Date().toISOString(),
        },
      }),
    });
    if (!res.ok) {
      console.error('[sharepoint] list item write failed', res.status, await res.text());
    }
  } catch (err) {
    console.error('[sharepoint] mirror failed', err);
  }
}
