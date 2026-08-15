import { MOCK_PROPERTIES } from './mockProperties.js';
import { MOCK_TENANCIES } from './mockTenancies.js';

export type AgreementStatus = 'SENT' | 'SIGNED';

export interface MockAgreement {
  tenancyId: string;
  status: AgreementStatus;
  content: string;
  initiatedAt: string;
  signedAt?: string;
  signedByName?: string;
}

// Keyed by tenancyId — one agreement per tenancy at a time.
export const mockAgreements = new Map<string, MockAgreement>();

const currency = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });

export function generateAgreementContent(tenancyId: string): string | null {
  const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
  if (!tenancy) return null;
  const property = MOCK_PROPERTIES.find((p) => p.id === tenancy.propertyId);
  if (!property) return null;

  const isLongTerm = property.propertyType === 'LONG_TERM';

  return `TENANCY AGREEMENT

This agreement is made between the Landlord and ${tenancy.tenantName} ("the Tenant") for the property described below.

PROPERTY: ${property.title}
ADDRESS: ${property.address}, ${property.lga}, ${property.state}
LEASE TYPE: ${isLongTerm ? 'Long-term lease' : 'Short-let'}
RENT: ${currency.format(tenancy.rentAmount)}${isLongTerm ? ' per year' : ' per stay'}
CAUTION DEPOSIT: ${currency.format(property.cautionDepositAmount)}
LEASE END DATE: ${new Date(tenancy.leaseEndDate).toLocaleDateString('en-GB')}

TERMS

1. The Tenant agrees to pay rent in full and on time as scheduled.
2. The Tenant agrees to keep the property in good condition, ordinary wear and tear excepted.
3. Structural and core-building repairs (foundation, roofing, main utilities, common areas) are the Landlord's responsibility. Day-to-day upkeep and any tenant-caused damage are the Tenant's responsibility, as set out in the property's maintenance responsibility checklist.
4. The Caution Deposit is refundable at the end of the tenancy, less any deductions for damage beyond normal wear and tear or amounts owed.
5. Either party must give written notice before the lease end date to terminate or renew, in line with applicable tenancy law for ${property.state} State.

By signing below, the Tenant acknowledges having read, understood, and agreed to the terms of this tenancy agreement.`;
}
