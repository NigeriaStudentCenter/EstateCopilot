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
import { sendWhatsAppMessage } from '../whatsapp.js';
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

interface MockMessage {
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  at: string;
  templateName?: string | null;
}
interface MockConversation extends Conversation {
  history: TurnMessage[];
  messages: MockMessage[]; // richer log for the ops console
  assignedOps?: string | null;
  updatedAt: string;
}

const mockConversations = new Map<string, MockConversation>(); // phone -> convo

function mockLoad(phone: string): MockConversation {
  let c = mockConversations.get(phone);
  if (!c) {
    c = {
      id: `wac_mock_${phone}`,
      phone,
      brand: 'UNKNOWN',
      state: 'AI_ACTIVE',
      history: [],
      messages: [],
      assignedOps: null,
      updatedAt: new Date().toISOString(),
    };
    mockConversations.set(phone, c);
  }
  return c;
}

function mockById(id: string): MockConversation | undefined {
  for (const c of mockConversations.values()) if (c.id === id) return c;
  return undefined;
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
    const c = mockLoad(convo.phone);
    c.history.push({ role: 'user', content: msg.body });
    c.messages.push({ direction: 'INBOUND', body: msg.body, at: new Date().toISOString() });
    c.updatedAt = new Date().toISOString();
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
    const c = mockLoad(convo.phone);
    c.history.push({ role: 'assistant', content: msg.body });
    c.messages.push({ direction: 'OUTBOUND', body: msg.body, at: new Date().toISOString() });
    c.updatedAt = new Date().toISOString();
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

// ---- ops console ----------------------------------------------------
//
// Read/act on conversations by id (not phone) for the human-takeover UI.

export interface ConversationSummary {
  id: string;
  phone: string;
  displayName: string | null;
  brand: WaBrand;
  state: WaConversationState;
  assignedOps: string | null;
  messageCount: number;
  lastMessage: { direction: string; body: string; at: string } | null;
  updatedAt: string;
}

export interface ConversationThread extends ConversationSummary {
  messages: { direction: string; body: string; at: string; templateName?: string | null }[];
}

export async function listConversations(filter: {
  state?: WaConversationState;
  brand?: WaBrand;
  limit?: number;
} = {}): Promise<ConversationSummary[]> {
  const limit = filter.limit ?? 100;

  if (env.mockMode) {
    return [...mockConversations.values()]
      .filter((c) => (!filter.state || c.state === filter.state) && (!filter.brand || c.brand === filter.brand))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        phone: c.phone,
        displayName: null,
        brand: c.brand,
        state: c.state,
        assignedOps: c.assignedOps ?? null,
        messageCount: c.messages.length,
        lastMessage: c.messages.length
          ? { direction: c.messages[c.messages.length - 1].direction, body: c.messages[c.messages.length - 1].body, at: c.messages[c.messages.length - 1].at }
          : null,
        updatedAt: c.updatedAt,
      }));
  }

  const rows = await prisma.waConversation.findMany({
    where: { ...(filter.state ? { state: filter.state } : {}), ...(filter.brand ? { brand: filter.brand } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: {
      contact: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { messages: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    phone: c.contact.phone,
    displayName: c.contact.displayName ?? null,
    brand: c.brand as WaBrand,
    state: c.state as WaConversationState,
    assignedOps: c.assignedOps ?? null,
    messageCount: c._count.messages,
    lastMessage: c.messages[0]
      ? { direction: c.messages[0].direction, body: c.messages[0].body, at: c.messages[0].createdAt.toISOString() }
      : null,
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function getThread(id: string): Promise<ConversationThread | null> {
  if (env.mockMode) {
    const c = mockById(id);
    if (!c) return null;
    return {
      id: c.id,
      phone: c.phone,
      displayName: null,
      brand: c.brand,
      state: c.state,
      assignedOps: c.assignedOps ?? null,
      messageCount: c.messages.length,
      lastMessage: c.messages.length
        ? { direction: c.messages[c.messages.length - 1].direction, body: c.messages[c.messages.length - 1].body, at: c.messages[c.messages.length - 1].at }
        : null,
      updatedAt: c.updatedAt,
      messages: c.messages.map((m) => ({ direction: m.direction, body: m.body, at: m.at, templateName: m.templateName ?? null })),
    };
  }

  const c = await prisma.waConversation.findUnique({
    where: { id },
    include: { contact: true, messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    phone: c.contact.phone,
    displayName: c.contact.displayName ?? null,
    brand: c.brand as WaBrand,
    state: c.state as WaConversationState,
    assignedOps: c.assignedOps ?? null,
    messageCount: c.messages.length,
    lastMessage: c.messages.length
      ? {
          direction: c.messages[c.messages.length - 1].direction,
          body: c.messages[c.messages.length - 1].body,
          at: c.messages[c.messages.length - 1].createdAt.toISOString(),
        }
      : null,
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages.map((m) => ({
      direction: m.direction,
      body: m.body,
      at: m.createdAt.toISOString(),
      templateName: m.templateName ?? null,
    })),
  };
}

async function setStateById(id: string, state: WaConversationState, opsName?: string | null): Promise<boolean> {
  if (env.mockMode) {
    const c = mockById(id);
    if (!c) return false;
    c.state = state;
    if (opsName !== undefined) c.assignedOps = opsName;
    c.updatedAt = new Date().toISOString();
    return true;
  }
  const r = await prisma.waConversation
    .update({
      where: { id },
      data: { state, ...(opsName !== undefined ? { assignedOps: opsName } : {}) },
    })
    .then(() => true)
    .catch(() => false);
  return r;
}

export const takeoverConversation = (id: string, opsName: string) => setStateById(id, 'HUMAN_ACTIVE', opsName || 'ops');
export const releaseConversation = (id: string) => setStateById(id, 'AI_ACTIVE', null);
export const closeConversation = (id: string) => setStateById(id, 'CLOSED');

// Human sends a message from the ops console. Implies takeover — the agent
// must not also be replying to this thread.
export async function replyAsHuman(id: string, body: string): Promise<{ ok: boolean; sent?: boolean; error?: string }> {
  const thread = await getThread(id);
  if (!thread) return { ok: false, error: 'conversation not found' };

  await setStateById(id, 'HUMAN_ACTIVE');

  const sent = await sendWhatsAppMessage(thread.phone, body);

  if (env.mockMode) {
    const c = mockById(id)!;
    c.history.push({ role: 'assistant', content: body });
    c.messages.push({ direction: 'OUTBOUND', body, at: new Date().toISOString() });
    c.updatedAt = new Date().toISOString();
  } else {
    await prisma.whatsAppMessage.create({
      data: {
        direction: 'OUTBOUND',
        fromNumber: '',
        toNumber: thread.phone,
        body,
        waMessageId: sent.id,
        brand: thread.brand === 'UNKNOWN' ? null : thread.brand,
        conversationId: id,
      },
    });
  }
  return { ok: true, sent: sent.sent };
}
