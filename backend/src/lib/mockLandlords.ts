// In-memory (MOCK_MODE only) landlord accounts — separate from env.ai.landlordDisplayName,
// which just names who AI-drafted replies are signed by.

import { hashPassword } from './passwords.js';

export interface MockLandlord {
  id: string;
  name: string;
  email: string;
  phone: string;
  state: string; // Nigeria state name selected at signup — ties the landlord's page/listings to that state
  passwordHash: string;
  referralCode?: string; // affiliate ?ref= captured at signup, reported to Kolo on activation
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

// Fixed-ID landlord that owns every pre-seeded demo property/tenancy
// (p1-p18, t1-t3). Keeps all the demo/QA flows this project was built and
// verified against working exactly as before, while every other (real)
// landlord signup starts with a genuinely empty portfolio.
export const DEMO_LANDLORD_ID = 'll_demo_estatecopilot';

export function seedDemoLandlord(): void {
  if (mockLandlords.has(DEMO_LANDLORD_ID)) return;
  const email = process.env.DEMO_LANDLORD_EMAIL ?? 'demo@estatecopilot.ng';
  const landlord: MockLandlord = {
    id: DEMO_LANDLORD_ID,
    name: 'Demo Landlord',
    email,
    phone: '2348000000000',
    state: 'Rivers', // matches the majority of the pre-seeded demo properties
    passwordHash: hashPassword(process.env.DEMO_LANDLORD_PASSWORD ?? 'ChangeMe123!'),
    subscriptionStatus: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };
  mockLandlords.set(landlord.id, landlord);
  mockLandlordsByEmail.set(email, landlord.id);
}
