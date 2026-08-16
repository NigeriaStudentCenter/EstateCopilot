// In-memory (MOCK_MODE only) store for landlord legal requests and the
// lawyer proposals ("quotes") submitted against them — same shape as the
// maintenance-ticket/repair-quote marketplace, applied to legal work
// instead of repairs.

export const LEGAL_CATEGORIES = [
  'Eviction & Notice to Quit',
  'Tenancy Agreement Drafting/Review',
  'Rent Recovery & Disputes',
  'Property Title & Compliance',
  'Other',
] as const;

export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];

export interface MockLegalRequest {
  id: string;
  propertyId: string;
  propertyTitle?: string;
  category: LegalCategory;
  description: string;
  raisedBy?: string;
  status: 'OPEN' | 'ENGAGED' | 'RESOLVED';
  openToMarketplace: boolean;
  engagedLawyerName?: string;
  engagedLawyerPhone?: string;
  engagedLawFirm?: string;
  createdAt: string;
}

export const mockLegalRequests: MockLegalRequest[] = [];

export interface MockLegalQuote {
  id: string;
  legalRequestId: string;
  lawyerName: string;
  lawyerPhone: string;
  lawyerEmail?: string;
  lawFirm?: string;
  amount: number;
  message?: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export const mockLegalQuotes: MockLegalQuote[] = [];

export function createMockLegalQuote(data: Omit<MockLegalQuote, 'id' | 'status' | 'createdAt'>): MockLegalQuote {
  const quote: MockLegalQuote = {
    id: `lq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: 'SUBMITTED',
    createdAt: new Date().toISOString(),
    ...data,
  };
  mockLegalQuotes.push(quote);
  return quote;
}
