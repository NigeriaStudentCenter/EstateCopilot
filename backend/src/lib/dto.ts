// Shared response mappers for the portal APIs.
//
// Every route that has a MOCK_MODE branch and a Prisma branch runs BOTH
// through the same mapper here, so `tsc` guarantees the two paths return an
// identical shape. This is the guardrail against mock/real drift — which is
// what silently broke the tenant portal in real mode: a raw Prisma tenancy
// has `tenant.name` and `leaseEnd`, but the frontend renders a flat `name`
// / `leaseEndDate` and crashed on the mismatch.
//
// Mapper inputs are deliberately permissive (accept the flat mock row OR the
// nested Prisma row); the RETURN type is strict and is the frontend contract.

export type LeaseStatus = 'ACTIVE' | 'PENDING' | 'OVERDUE' | 'TERMINATED';
export type KycStatus = 'VERIFIED' | 'PENDING' | 'FAILED';
export type LevyStatus = 'CLEARED' | 'ARREARS';
export type InstallmentStatus = 'PENDING' | 'PAID' | 'OVERDUE';

// ---- Tenancy -------------------------------------------------------

export interface TenancyDto {
  id: string;
  propertyId: string;
  propertyTitle: string;
  tenantName: string;
  tenantPhone?: string;
  leaseEndDate: string; // ISO
  paymentStatus: LeaseStatus;
  rentAmount: number;
  discoArrears: number; // no real per-tenancy source yet -> 0
  lgLevyStatus: LevyStatus;
  kycStatus: KycStatus;
}

interface TenancyLike {
  id: string;
  rentAmount: number;
  paymentStatus: string;
  propertyId?: string;
  // flat (MockTenancy)
  propertyTitle?: string;
  tenantName?: string;
  tenantPhone?: string;
  leaseEndDate?: string;
  discoArrears?: number;
  lgLevyStatus?: string;
  kycStatus?: string;
  // nested (Prisma tenancy with tenant + property included)
  leaseEnd?: Date | string;
  tenant?: { name?: string | null; phone?: string | null; kycStatus?: string | null } | null;
  property?: { id?: string; title?: string | null } | null;
}

export function toTenancyDto(t: TenancyLike, opts?: { lgLevyStatus?: LevyStatus }): TenancyDto {
  return {
    id: t.id,
    propertyId: t.propertyId ?? t.property?.id ?? '',
    propertyTitle: t.propertyTitle ?? t.property?.title ?? '',
    tenantName: t.tenantName ?? t.tenant?.name ?? '',
    tenantPhone: t.tenantPhone ?? t.tenant?.phone ?? undefined,
    leaseEndDate: t.leaseEndDate ?? (t.leaseEnd ? new Date(t.leaseEnd).toISOString() : ''),
    paymentStatus: (t.paymentStatus as LeaseStatus) || 'PENDING',
    rentAmount: t.rentAmount,
    discoArrears: t.discoArrears ?? 0,
    lgLevyStatus: opts?.lgLevyStatus ?? ((t.lgLevyStatus as LevyStatus) || 'CLEARED'),
    kycStatus: ((t.kycStatus ?? t.tenant?.kycStatus) as KycStatus) || 'PENDING',
  };
}

// ---- Rent installment -------------------------------------------

export interface InstallmentDto {
  sequence: number;
  amount: number;
  dueDate: string; // ISO
  status: InstallmentStatus;
  paystackRequestCode: string;
  paymentLink: string;
}

interface InstallmentLike {
  sequence: number;
  amount: number;
  dueDate: Date | string;
  status: string;
  paystackRequestCode?: string | null;
  paymentLink?: string | null;
}

export function toInstallmentDto(i: InstallmentLike): InstallmentDto {
  return {
    sequence: i.sequence,
    amount: i.amount,
    dueDate: typeof i.dueDate === 'string' ? i.dueDate : new Date(i.dueDate).toISOString(),
    status: (i.status as InstallmentStatus) || 'PENDING',
    paystackRequestCode: i.paystackRequestCode ?? '',
    paymentLink: i.paymentLink ?? '',
  };
}
