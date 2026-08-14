export type PropertyStatus = 'LONG_TERM' | 'SHORT_LET';
export type LeaseStatus = 'ACTIVE' | 'PENDING' | 'OVERDUE' | 'TERMINATED';
export type LevyStatus = 'CLEARED' | 'ARREARS';
export type KycStatus = 'VERIFIED' | 'PENDING' | 'FAILED';

export interface Property {
  id: string;
  title: string;
  address: string;
  state: string;
  lga: string; // Eti-Osa, Ikeja, AMAC, etc. — drives Tenement Rate lookup
  propertyType: PropertyStatus;
  rentAmount: number;
  cautionDepositAmount: number;
  municipalId?: string; // Tenement Rate / property ID with the LGA
  imageUrls?: string[];
  isAdvertised?: boolean;
  listingDescription?: string;
}

export interface Tenancy {
  id: string;
  propertyTitle: string;
  tenantName: string;
  tenantPhone?: string;
  leaseEndDate: string; // ISO date string
  paymentStatus: LeaseStatus;
  rentAmount: number;
  discoArrears: number; // Prepaid power token debt (EKEDC/IKEDC/AEDC)
  lgLevyStatus: LevyStatus; // Tenement Rate, Environmental/LAWMA dues
  kycStatus: KycStatus; // NIN/BVN + guarantor verification via WhatsApp
}

export interface DashboardStats {
  totalRevenue: number;
  activeTenancies: number;
  pendingRepairs: number;
  municipalLeviesDue: number; // e.g., Tenement Rate, LAWMA
  pendingVerifications: number; // tenants/guarantors mid-KYC
}

export type MaintenanceStatus = 'OPEN' | 'DISPATCHED' | 'AWAITING_TENANT_SIGNOFF' | 'RESOLVED';
export type RepairResponsibility = 'LANDLORD' | 'TENANT' | 'UNCLEAR';

export interface MaintenanceTicket {
  id: string;
  propertyId: string;
  propertyTitle?: string;
  raisedBy?: string;
  description: string;
  categoryId?: string | null;
  categoryLabel?: string | null;
  responsibility?: RepairResponsibility;
  sourceMessage?: string;
  status: MaintenanceStatus;
  openToMarketplace?: boolean;
  tenantSignedOff: boolean;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

export interface ResponsibilityChecklist {
  responsibility: 'LANDLORD' | 'TENANT';
  title: string;
  sections: ChecklistSection[];
}

export type CorrespondenceChannel = 'WHATSAPP' | 'EMAIL' | 'SMS' | 'NOTE';
export type CorrespondenceDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';

export interface CorrespondenceEntry {
  id: string;
  channel: CorrespondenceChannel;
  direction: CorrespondenceDirection;
  author: string;
  body: string;
  createdAt: string;
}

export type RentPaymentPlan = 'FULL' | 'INSTALLMENTS';
export type InstallmentStatus = 'PENDING' | 'PAID' | 'OVERDUE';

export interface RentInstallment {
  sequence: number;
  amount: number;
  dueDate: string;
  status: InstallmentStatus;
  paystackRequestCode: string;
  paymentLink: string;
}

export type BookingType = 'PROPERTY_VIEWING' | 'REPAIR_QUOTE_VISIT';
export type BookingStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface Booking {
  id: string;
  type: BookingType;
  label: string;
  propertyId?: string;
  maintenanceTicketId?: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail?: string;
  scheduledFor: string;
  status: BookingStatus;
  notes?: string;
  createdAt: string;
}

export interface RepairQuote {
  id: string;
  maintenanceTicketId: string;
  handymanName: string;
  handymanPhone: string;
  handymanEmail?: string;
  amount: number;
  message?: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}
