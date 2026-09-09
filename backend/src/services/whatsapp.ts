import { env } from '../config/env.js';

// Sends an outbound WhatsApp message via the Meta Cloud API.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
export async function sendWhatsAppMessage(to: string, body: string): Promise<{ sent: boolean; id?: string }> {
  if (env.mockMode || !env.whatsapp.metaToken || !env.whatsapp.metaPhoneNumberId) {
    console.log(`[whatsapp:mock] -> ${to}: ${body}`);
    return { sent: true, id: `mock_${Date.now()}` };
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.whatsapp.graphVersion}/${env.whatsapp.metaPhoneNumberId}/messages`,
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

// Sends an approved template message — the only thing allowed to open a new
// (business-initiated) conversation outside the 24-hour window, so this is
// what campaigns use. `bodyParams` fills the template's {{1}}, {{2}} … in
// order.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode = 'en',
  bodyParams: string[] = [],
): Promise<{ sent: boolean; id?: string }> {
  if (env.mockMode || !env.whatsapp.metaToken || !env.whatsapp.metaPhoneNumberId) {
    console.log(`[whatsapp:mock:template] -> ${to}: ${templateName}(${languageCode}) [${bodyParams.join(' | ')}]`);
    return { sent: true, id: `mock_tpl_${Date.now()}` };
  }

  const components = bodyParams.length
    ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }]
    : undefined;

  const response = await fetch(
    `https://graph.facebook.com/${env.whatsapp.graphVersion}/${env.whatsapp.metaPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.whatsapp.metaToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components ? { components } : {}),
        },
      }),
    },
  );

  if (!response.ok) {
    console.error(
      `[whatsapp:template] send failed (${response.status}) -> ${to}: ${await response.text().catch(() => '')}`,
    );
    return { sent: false };
  }
  const data = (await response.json()) as { messages?: { id: string }[] };
  return { sent: true, id: data.messages?.[0]?.id };
}

// Sends an image or video by public URL (with an optional caption). Used by
// the agent to attach the illustration for an onboarding step.
export async function sendWhatsAppMedia(
  to: string,
  kind: 'image' | 'video',
  link: string,
  caption?: string,
): Promise<{ sent: boolean; id?: string }> {
  if (env.mockMode || !env.whatsapp.metaToken || !env.whatsapp.metaPhoneNumberId) {
    console.log(`[whatsapp:mock:${kind}] -> ${to}: ${link}${caption ? ` (${caption})` : ''}`);
    return { sent: true, id: `mock_${kind}_${Date.now()}` };
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.whatsapp.graphVersion}/${env.whatsapp.metaPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.whatsapp.metaToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: kind,
        [kind]: { link, ...(caption ? { caption } : {}) },
      }),
    },
  );

  if (!response.ok) {
    console.error(`[whatsapp:${kind}] send failed (${response.status}) -> ${to}: ${await response.text().catch(() => '')}`);
    return { sent: false };
  }
  const data = (await response.json()) as { messages?: { id: string }[] };
  return { sent: true, id: data.messages?.[0]?.id };
}
