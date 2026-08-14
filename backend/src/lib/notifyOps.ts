import { env } from '../config/env.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { sendEmail } from '../services/email.js';

// Every public booking/quote submission routes here — one call fans it out
// over both WhatsApp and email so ops never miss it regardless of which
// channel they actually watch.
export async function notifyOps(subject: string, body: string) {
  await Promise.all([
    sendWhatsAppMessage(env.ops.whatsappNumber, `${subject}\n${body}`),
    sendEmail(env.ops.email, subject, body),
  ]);
}
