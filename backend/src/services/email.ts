import { env } from '../config/env.js';

// Mock email sender, same fallback pattern as services/whatsapp.ts — logs in
// MOCK_MODE / without credentials, otherwise sends via whichever provider
// you wire up (Resend, SES, Postmark, etc.) once ready to go live.
export async function sendEmail(to: string, subject: string, body: string): Promise<{ sent: boolean }> {
  if (env.mockMode || !env.email.provider) {
    console.log(`[email:mock] -> ${to} | ${subject}\n${body}`);
    return { sent: true };
  }

  // TODO: wire a real provider here (e.g. Resend's HTTP API) once
  // env.email.provider / env.email.apiKey are set.
  console.log(`[email:unconfigured-provider] -> ${to} | ${subject}`);
  return { sent: false };
}
