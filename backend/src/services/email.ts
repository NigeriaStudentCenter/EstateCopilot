import { env } from '../config/env.js';

// Email sender, same fallback pattern as services/whatsapp.ts — logs in
// MOCK_MODE / without credentials, otherwise sends for real. Resend is the
// only wired provider today (set EMAIL_PROVIDER=resend + EMAIL_API_KEY);
// any other provider value logs a warning and no-ops so a misconfig can't
// silently swallow ops alerts.
export async function sendEmail(to: string, subject: string, body: string): Promise<{ sent: boolean }> {
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
