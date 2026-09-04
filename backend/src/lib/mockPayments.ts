// MOCK_MODE-only store of confirmed tenant payments, keyed by tenancyId.
// In a real deploy these rows live on the Payment table (Prisma). They are
// purely a record for the landlord — by the time a webhook lands, the money
// has already settled into the landlord's own bank account via their
// Paystack subaccount.

export interface MockPayment {
  id: string;
  tenancyId: string;
  purpose: 'RENT' | 'CAUTION_DEPOSIT' | 'UTILITY' | 'LEVY';
  amount: number; // kobo
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  provider: string;
  providerRef?: string;
  createdAt: string;
}

const byTenancy = new Map<string, MockPayment[]>();

export function recordMockPayment(p: Omit<MockPayment, 'id' | 'createdAt'>): MockPayment {
  const row: MockPayment = { ...p, id: `pay_mock_${Date.now()}_${Math.floor(Math.random() * 1e4)}`, createdAt: new Date().toISOString() };
  const list = byTenancy.get(p.tenancyId) ?? [];
  list.unshift(row);
  byTenancy.set(p.tenancyId, list);
  return row;
}

export function mockPaymentsForTenancies(tenancyIds: string[]): MockPayment[] {
  return tenancyIds
    .flatMap((id) => byTenancy.get(id) ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
