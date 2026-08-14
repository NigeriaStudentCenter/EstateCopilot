// Shared mock tenancy/property data (MOCK_MODE only) so tenancies.ts,
// tenantAuth.ts, tenantPortal.ts, and maintenance.ts can all reference the
// same records without importing each other.

export interface MockTenancy {
  id: string;
  propertyId: string;
  propertyTitle: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  leaseEndDate: string;
  paymentStatus: 'ACTIVE' | 'PENDING' | 'OVERDUE' | 'TERMINATED';
  rentAmount: number;
  discoArrears: number;
  lgLevyStatus: 'CLEARED' | 'ARREARS';
  kycStatus: 'VERIFIED' | 'PENDING' | 'FAILED';
}

export const MOCK_TENANCIES: MockTenancy[] = [
  { id: 't1', propertyId: 'p1', propertyTitle: 'Luxury 3-Bedroom Apartment (Unit A)', tenantName: 'Musa Bello', tenantPhone: '2348011111111', tenantEmail: 'musa.bello@example.com', leaseEndDate: '2027-10-15', paymentStatus: 'ACTIVE', rentAmount: 6500000, discoArrears: 0, lgLevyStatus: 'CLEARED', kycStatus: 'VERIFIED' },
  { id: 't2', propertyId: 'p2', propertyTitle: 'Studio Apartment (VIP Access)', tenantName: 'Jennifer Adebayo', tenantPhone: '2348022222222', tenantEmail: 'jennifer.adebayo@example.com', leaseEndDate: '2026-09-12', paymentStatus: 'ACTIVE', rentAmount: 75000, discoArrears: 35000, lgLevyStatus: 'CLEARED', kycStatus: 'VERIFIED' },
  { id: 't3', propertyId: 'p3', propertyTitle: 'Serviced Flat (Trans-Amadi)', tenantName: 'Chidi Okonkwo', tenantPhone: '2348033333333', tenantEmail: 'chidi.okonkwo@example.com', leaseEndDate: '2026-08-20', paymentStatus: 'OVERDUE', rentAmount: 4800000, discoArrears: 12000, lgLevyStatus: 'ARREARS', kycStatus: 'PENDING' },
];

// sequence -> in-memory installment schedules, keyed by tenancyId (mock mode only)
export const mockPaymentPlans = new Map<string, { plan: 'FULL' | 'INSTALLMENTS'; installments: any[] }>();

// tenant portal login credentials, keyed by email (mock mode only — a real
// deploy stores passwordHash on the Tenant row via Prisma instead)
export interface MockTenantAccount {
  email: string;
  passwordHash: string;
  name: string;
  tenancyId: string;
}
export const mockTenantAccounts = new Map<string, MockTenantAccount>();
