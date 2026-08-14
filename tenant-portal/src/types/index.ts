export interface TenancyInfo {
  id: string;
  propertyTitle: string;
  tenantName: string;
  name: string;
  email: string;
  leaseEndDate: string;
  paymentStatus: 'ACTIVE' | 'PENDING' | 'OVERDUE' | 'TERMINATED';
  rentAmount: number;
  discoArrears: number;
  lgLevyStatus: 'CLEARED' | 'ARREARS';
  kycStatus: 'VERIFIED' | 'PENDING' | 'FAILED';
}

export interface CorrespondenceEntry {
  id: string;
  channel: 'WHATSAPP' | 'EMAIL' | 'SMS' | 'PORTAL';
  direction: 'INBOUND' | 'OUTBOUND';
  author: string;
  body: string;
  createdAt: string;
}

export interface RentInstallment {
  sequence: number;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  paymentLink: string;
}

export type Responsibility = 'LANDLORD' | 'TENANT' | 'UNCLEAR';

export interface MaintenanceTicket {
  id: string;
  description: string;
  categoryLabel?: string | null;
  responsibility?: Responsibility;
  status: 'OPEN' | 'DISPATCHED' | 'AWAITING_TENANT_SIGNOFF' | 'RESOLVED';
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
