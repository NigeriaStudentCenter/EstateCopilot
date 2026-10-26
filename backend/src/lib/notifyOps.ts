import { env } from '../config/env.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { sendEmail } from '../services/email.js';

// Every public booking/quote submission routes here — one call fans it out
// over both WhatsApp and email so ops never miss it regardless of which
// channel they actually watch.
export async function notifyOps(subject: string, body: string): Promise<{ whatsappSent: boolean; emailSent: boolean }> {
  const [wa, em] = await Promise.allSettled([
    sendWhatsAppMessage(env.ops.whatsappNumber, `${subject}\n${body}`),
    sendEmail(env.ops.email, subject, body),
  ]);
  if (wa.status === 'rejected') console.error('[notifyOps] WhatsApp alert threw', wa.reason);
  if (em.status === 'rejected') console.error('[notifyOps] email alert threw', em.reason);
  return {
    whatsappSent: wa.status === 'fulfilled' && wa.value.sent,
    // sendEmail() reports sent:true when it only logged (no provider set), so
    // callers must not treat emailSent as proof a human was reached.
    emailSent: em.status === 'fulfilled' && em.value.sent,
  };
}
