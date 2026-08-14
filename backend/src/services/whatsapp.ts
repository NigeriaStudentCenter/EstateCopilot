import { env } from '../config/env.js';

// Sends an outbound WhatsApp message via the Meta Cloud API.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
export async function sendWhatsAppMessage(to: string, body: string): Promise<{ sent: boolean; id?: string }> {
  if (env.mockMode || !env.whatsapp.metaToken || !env.whatsapp.metaPhoneNumberId) {
    console.log(`[whatsapp:mock] -> ${to}: ${body}`);
    return { sent: true, id: `mock_${Date.now()}` };
  }

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${env.whatsapp.metaPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.whatsapp.metaToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    return { sent: false };
  }

  const data = (await response.json()) as { messages: { id: string }[] };
  return { sent: true, id: data.messages?.[0]?.id };
}
