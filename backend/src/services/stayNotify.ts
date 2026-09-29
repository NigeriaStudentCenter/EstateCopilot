// Emails for stays — to the guest, and for student bookings the parent /
// guardian / sponsor too. Every message carries the guest's private booking
// page link, which is how they manage the stay without an account.
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { sendEmail } from './email.js';

export function newManageToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function manageUrl(token: string): string {
  return `${env.marketplace.listingsUrl}/stays/booking/${token}`;
}

interface StayForEmail {
  guestName: string;
  guestEmail: string;
  sponsorName?: string | null;
  sponsorEmail?: string | null;
  payer?: string | null;
  manageToken?: string | null;
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? full;
}

/** Email the guest and (if there is one) the sponsor. `body` gets the manage link appended. */
export async function emailStayParties(b: StayForEmail, subject: string, guestBody: string, sponsorBody?: string) {
  const link = b.manageToken ? `\n\nYour booking page: ${manageUrl(b.manageToken)}` : '';
  const sends = [sendEmail(b.guestEmail, subject, `Hi ${firstName(b.guestName)},\n\n${guestBody}${link}\n\nEstateCopilot`)];
  if (b.sponsorEmail && sponsorBody) {
    sends.push(
      sendEmail(
        b.sponsorEmail,
        subject,
        `Hi ${b.sponsorName ? firstName(b.sponsorName) : 'there'},\n\n${sponsorBody}${link}\n\nEstateCopilot — safe, verified student housing`,
      ),
    );
  }
  await Promise.allSettled(sends);
}
