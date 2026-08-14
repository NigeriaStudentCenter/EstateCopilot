// In-memory (MOCK_MODE) store shared across routes: correspondence threads
// and the AI-drafted replies pending landlord approval. Kept in one module
// so tenancies.ts, correspondence.ts, tenantPortal.ts, and aiDrafts.ts can
// all read/write it without importing each other.

export interface CorrespondenceEntry {
  id: string;
  channel: 'WHATSAPP' | 'EMAIL' | 'SMS' | 'NOTE' | 'PORTAL';
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  author: string;
  body: string;
  createdAt: string;
}

export interface CorrespondenceDraft {
  id: string;
  tenancyId: string;
  inReplyToBody: string;
  suggestedBody: string;
  channel: 'EMAIL' | 'WHATSAPP';
  status: 'PENDING_REVIEW' | 'APPROVED' | 'EDITED_AND_SENT' | 'REJECTED';
  reviewedBy?: string;
  sentBody?: string;
  createdAt: string;
  reviewedAt?: string;
}

export const mockCorrespondence: Record<string, CorrespondenceEntry[]> = {
  t3: [
    {
      id: 'c1',
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      author: 'Chidi Okonkwo',
      body: 'Good afternoon, I will complete the outstanding rent balance by the end of this week.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    },
    {
      id: 'c2',
      channel: 'NOTE',
      direction: 'INTERNAL',
      author: 'System',
      body: 'Rent reminder (30-day) sent automatically — no response yet.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
  ],
};

export const mockDrafts: Record<string, CorrespondenceDraft> = {};

export function logMockCorrespondence(
  tenancyId: string,
  entry: Omit<CorrespondenceEntry, 'id' | 'createdAt'>,
): CorrespondenceEntry {
  const record: CorrespondenceEntry = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  mockCorrespondence[tenancyId] = [...(mockCorrespondence[tenancyId] ?? []), record];
  return record;
}

export function createMockDraft(params: {
  tenancyId: string;
  inReplyToBody: string;
  suggestedBody: string;
  channel?: 'EMAIL' | 'WHATSAPP';
}): CorrespondenceDraft {
  const draft: CorrespondenceDraft = {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tenancyId: params.tenancyId,
    inReplyToBody: params.inReplyToBody,
    suggestedBody: params.suggestedBody,
    channel: params.channel ?? 'EMAIL',
    status: 'PENDING_REVIEW',
    createdAt: new Date().toISOString(),
  };
  mockDrafts[draft.id] = draft;
  return draft;
}

export function listMockDrafts(status?: CorrespondenceDraft['status']): CorrespondenceDraft[] {
  const all = Object.values(mockDrafts).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return status ? all.filter((d) => d.status === status) : all;
}
