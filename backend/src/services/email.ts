import { env } from '../config/env.js';

// Email sender, same fallback pattern as services/whatsapp.ts — logs in
// MOCK_MODE / without credentials, otherwise sends for real. Resend is the
// only wired provider today (set EMAIL_PROVIDER=resend + EMAIL_API_KEY);
// any other provider value logs a warning and no-ops so a misconfig can't
// silently swallow ops alerts.
export async function sendEmail(to: string, subject: string, body: string): Promise<{ sent: boolean }> {
  if (!env.mockMode && env.email.provider === 'graph') {
    return sendViaGraph(to, subject, body);
  }
  if (env.mockMode || !env.email.provider || !env.email.apiKey) {
    console.log(`[email:mock] -> ${to} | ${subject}\n${body}`);
    return { sent: true };
  }

  if (env.email.provider !== 'resend') {
    console.warn(`[email] EMAIL_PROVIDER="${env.email.provider}" is not supported (only "resend") -> ${to} | ${subject}`);
    return { sent: false };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.email.apiKey}`,
      },
      body: JSON.stringify({
        from: env.email.from,
        to: [to],
        subject,
        // Plain-text body; keep line breaks readable in the client.
        text: body,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`[email] Resend send failed (${response.status}) -> ${to}: ${detail}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    // Never let a mail outage break the request that triggered it.
    console.error(`[email] Resend send threw -> ${to}`, err);
    return { sent: false };
  }
}

// ---- Microsoft 365 (Graph) ----
// EMAIL_FROM may be "Name <mailbox@domain>" or a bare address; Graph sends as
// the mailbox, so only the address part matters.
let graphToken: { value: string; expiresAt: number } | null = null;

async function graphAccessToken(): Promise<string | null> {
  const { graphTenantId, graphClientId, graphClientSecret } = env.email;
  if (!graphTenantId || !graphClientId || !graphClientSecret) return null;
  if (graphToken && graphToken.expiresAt > Date.now() + 60_000) return graphToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${graphTenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: graphClientId,
      client_secret: graphClientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) {
    console.error('[email] Graph token request failed', res.status);
    return null;
  }
  const b = (await res.json()) as { access_token: string; expires_in: number };
  graphToken = { value: b.access_token, expiresAt: Date.now() + b.expires_in * 1000 };
  return graphToken.value;
}

async function sendViaGraph(to: string, subject: string, body: string): Promise<{ sent: boolean }> {
  const from = env.email.from.match(/<([^>]+)>/)?.[1] ?? env.email.from;
  try {
    const token = await graphAccessToken();
    if (!token) {
      console.warn(`[email] Graph not configured -> ${to} | ${subject}`);
      return { sent: false };
    }
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Graph send failed (${res.status}) -> ${to}: ${(await res.text()).slice(0, 300)}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[email] Graph send threw -> ${to}`, err);
    return { sent: false };
  }
}
