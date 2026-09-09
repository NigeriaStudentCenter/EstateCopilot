// Conversation + message persistence for the marketing agent.
//
// Same split as the rest of the codebase: in MOCK_MODE everything lives in
// process memory so the flow is exercisable with no Postgres; otherwise it
// goes through Prisma (WaContact / WaConversation / WhatsAppMessage).
//
// The agent talks to this module only — it never touches Prisma directly —
// so the mock and real paths can diverge without leaking into agent logic.

import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import type { WaBrand } from './brands.js';

export type WaConversationState = 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'AWAITING_OPT_IN' | 'CLOSED';

export interface Conversation {
  id: string;
  phone: string;
  brand: WaBrand;
  state: WaConversationState;
}

export interface TurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---- mock store --------------------------------------------------------

interface MockConversation extends Conversation {
  history: TurnMessage[];
}

const mockConversations = new Map<string, MockConversation>(); // phone -> convo

function mockLoad(phone: string): MockConversation {
  let c = mockConversations.get(phone);
  if (!c) {
    c = { id: `wac_mock_${Date.now()}`, phone, brand: 'UNKNOWN', state: 'AI_ACTIVE', history: [] };
    mockConversations.set(phone, c);
  }
  return c;
}

// ---- public API ------------------------------------------------------

export async function loadConversation(phone: string): Promise<Conversation> {
  if (env.mockMode) {
    const c = mockLoad(phone);
    return { id: c.id, phone: c.phone, brand: c.brand, state: c.state };
  }

  const contact = await prisma.waContact.upsert({
    where: { phone },
    create: { phone },
    update: {},
  });
  let convo = await prisma.waConversation.findFirst({
    where: { contactId: contact.id, state: { not: 'CLOSED' } },
    orderBy: { createdAt: 'desc' },
  });
  if (!convo) {
    convo = await prisma.waConversation.create({ data: { contactId: contact.id } });
  }
  return {
    id: convo.id,
    phone,
    brand: convo.brand as WaBrand,
    state: convo.state as WaConversationState,
  };
}

export async function history(convo: Conversation, limit = 12): Promise<TurnMessage[]> {
  if (env.mockMode) {
    return mockLoad(convo.phone).history.slice(-limit);
  }
  // Most recent `limit` messages, back in chronological order for the model.
  const rows = await prisma.whatsAppMessage.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows
    .reverse()
    .map((r) => ({
      role: r.direction === 'INBOUND' ? ('user' as const) : ('assistant' as const),
      content: r.body,
    }));
}

// Pins the brand the first time we're confident about it; never overwrites a
// brand already set (a mid-conversation topic swerve shouldn't re-home the
// whole thread — the agent handles that in-persona instead).
export async function setBrand(convo: Conversation, brand: WaBrand): Promise<void> {
  if (brand === 'UNKNOWN' || convo.brand !== 'UNKNOWN') return;
  convo.brand = brand;
  if (env.mockMode) {
    mockLoad(convo.phone).brand = brand;
    return;
  }
  await prisma.waConversation.update({ where: { id: convo.id }, data: { brand } }).catch(() => {});
}

export async function setState(convo: Conversation, state: WaConversationState): Promise<void> {
  convo.state = state;
  if (env.mockMode) {
    mockLoad(convo.phone).state = state;
    return;
  }
  await prisma.waConversation.update({ where: { id: convo.id }, data: { state } }).catch(() => {});
}

export async function recordInbound(
  convo: Conversation,
  msg: { body: string; from: string; to: string; waMessageId?: string },
): Promise<void> {
  if (env.mockMode) {
    mockLoad(convo.phone).history.push({ role: 'user', content: msg.body });
    return;
  }
  await prisma.whatsAppMessage.create({
    data: {
      direction: 'INBOUND',
      fromNumber: msg.from,
      toNumber: msg.to,
      body: msg.body,
      waMessageId: msg.waMessageId,
      brand: convo.brand === 'UNKNOWN' ? null : convo.brand,
      conversationId: convo.id,
    },
  });
  await prisma.waConversation
    .update({ where: { id: convo.id }, data: { lastInboundAt: new Date() } })
    .catch(() => {});
}

export async function recordOutbound(
  convo: Conversation,
  msg: { body: string; from: string; to: string; waMessageId?: string },
): Promise<void> {
  if (env.mockMode) {
    mockLoad(convo.phone).history.push({ role: 'assistant', content: msg.body });
    return;
  }
  await prisma.whatsAppMessage.create({
    data: {
      direction: 'OUTBOUND',
      fromNumber: msg.from,
      toNumber: msg.to,
      body: msg.body,
      waMessageId: msg.waMessageId,
      brand: convo.brand === 'UNKNOWN' ? null : convo.brand,
      conversationId: convo.id,
    },
  });
}
