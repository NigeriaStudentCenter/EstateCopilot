import { env } from '../config/env.js';

export interface DraftReplyParams {
  tenantName: string;
  propertyTitle: string;
  tenantMessage: string;
  // When the message came from a categorized repair report, the AI is told
  // the verdict rather than guessing — it should never claim something is
  // the landlord's job (or the tenant's) on its own judgment.
  repairContext?: {
    categoryLabel: string;
    responsibility: 'LANDLORD' | 'TENANT' | 'UNCLEAR';
  };
}

// Drafts a reply in the landlord's voice. Never sent directly — the caller
// always stores this as a pending CorrespondenceDraft for landlord review.
export async function draftReply(params: DraftReplyParams): Promise<string> {
  if (env.mockMode || !env.ai.anthropicApiKey) {
    return mockDraft(params);
  }

  const repairNote = params.repairContext
    ? `\n\nThis was reported via the repair checklist as "${params.repairContext.categoryLabel}", classified as the ${params.repairContext.responsibility.toLowerCase()}'s responsibility. State that plainly and, if it's the tenant's responsibility, say so kindly without sounding dismissive.`
    : '';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ai.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      system:
        `You draft short, warm, professional email replies on behalf of a Nigerian residential landlord named ${env.ai.landlordDisplayName}. ` +
        'Acknowledge the tenant\'s message, address it directly and concretely, and never invent facts (payment amounts, dates, repair timelines) you were not given. ' +
        'Sign off with the landlord\'s first name. Keep it under 120 words.',
      messages: [
        {
          role: 'user',
          content: `Tenant ${params.tenantName} at ${params.propertyTitle} wrote:\n\n"${params.tenantMessage}"${repairNote}\n\nDraft the reply.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return mockDraft(params); // never block the tenant's message on an AI outage
  }

  const data = (await response.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((c) => c.type === 'text')?.text;
  return text?.trim() || mockDraft(params);
}

function mockDraft({ tenantName, propertyTitle, tenantMessage, repairContext }: DraftReplyParams): string {
  const lower = tenantMessage.toLowerCase();
  const landlord = env.ai.landlordDisplayName.split(' ')[0];

  if (repairContext) {
    if (repairContext.responsibility === 'LANDLORD') {
      return `Hi ${tenantName}, thanks for flagging this at ${propertyTitle}. "${repairContext.categoryLabel}" is on me as landlord — I've logged a maintenance ticket and will get someone out to look at it. I'll update you once it's scheduled.\n\n${landlord}`;
    }
    if (repairContext.responsibility === 'TENANT') {
      return `Hi ${tenantName}, thanks for letting me know. "${repairContext.categoryLabel}" typically falls under day-to-day upkeep the tenant handles, so it wouldn't usually come out of the management budget — but let me know if you'd like a recommendation for someone reliable to fix it.\n\n${landlord}`;
    }
    return `Hi ${tenantName}, thanks for the report at ${propertyTitle}. I want to take a closer look before saying who this falls to — I'll get back to you shortly with next steps.\n\n${landlord}`;
  }

  if (/(rent|payment|pay|deposit|installment)/.test(lower)) {
    return `Hi ${tenantName}, thank you for the update on your rent for ${propertyTitle}. I've noted this and will follow up on my end — please keep me posted if anything changes.\n\n${landlord}`;
  }
  if (/(leak|repair|fix|broken|generator|water|light|electric|ac\b)/.test(lower)) {
    return `Hi ${tenantName}, sorry for the trouble at ${propertyTitle}. I've logged this as a maintenance ticket and will get someone out to look at it — I'll update you as soon as it's scheduled.\n\n${landlord}`;
  }
  return `Hi ${tenantName}, thanks for reaching out about ${propertyTitle}. I've seen your message and will get back to you shortly with more detail.\n\n${landlord}`;
}
