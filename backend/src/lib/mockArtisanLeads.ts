// In-memory ArtisanLead store for MOCK_MODE — mirrors the Prisma model shape.
import type { TradeId } from './trades.js';

export interface MockArtisanLead {
  id: string;
  artisanId: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail?: string;
  requesterRole?: string;
  lga?: string;
  trade?: TradeId;
  message: string;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  createdAt: string;
}

export const mockArtisanLeads: MockArtisanLead[] = [];

export function createMockLead(data: Omit<MockArtisanLead, 'id' | 'status' | 'createdAt'>): MockArtisanLead {
  const lead: MockArtisanLead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'NEW',
    createdAt: new Date().toISOString(),
    ...data,
  };
  mockArtisanLeads.push(lead);
  return lead;
}
