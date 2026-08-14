// In-memory (MOCK_MODE only) landlord accounts — separate from env.ai.landlordDisplayName,
// which just names who AI-drafted replies are signed by.

export interface MockLandlord {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  subscriptionStatus: 'PENDING_PAYMENT' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
  pendingReference?: string;
  paystackCustomerCode?: string;
  paystackSubscriptionCode?: string;
  currentPeriodEnd?: string;
  createdAt: string;
  bankAccountNumber?: string;
  bankCode?: string;
  bankAccountName?: string;
  paystackSubaccountCode?: string;
}

export const mockLandlords = new Map<string, MockLandlord>(); // keyed by id
export const mockLandlordsByEmail = new Map<string, string>(); // email -> id

export function createMockLandlord(data: Omit<MockLandlord, 'id' | 'createdAt' | 'subscriptionStatus'>): MockLandlord {
  const landlord: MockLandlord = {
    id: `ll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    subscriptionStatus: 'PENDING_PAYMENT',
    createdAt: new Date().toISOString(),
    ...data,
  };
  mockLandlords.set(landlord.id, landlord);
  mockLandlordsByEmail.set(landlord.email, landlord.id);
  return landlord;
}

export function findMockLandlordByReference(reference: string): MockLandlord | undefined {
  return Array.from(mockLandlords.values()).find((l) => l.pendingReference === reference);
}
