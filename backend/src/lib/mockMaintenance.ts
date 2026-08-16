// In-memory (MOCK_MODE only) maintenance ticket store — its own module
// (rather than living inside routes/maintenance.ts) so lib/ownership.ts,
// routes/bookings.ts, and routes/public.ts can all import it without
// reaching into another router's file.

export interface MockTicket {
  id: string;
  propertyId: string;
  propertyTitle?: string;
  raisedBy?: string;
  description: string;
  sourceMessage?: string;
  status: 'OPEN' | 'DISPATCHED' | 'AWAITING_TENANT_SIGNOFF' | 'RESOLVED';
  proofPhotoUrls: string[];
  tenantSignedOff: boolean;
  categoryId: string | null;
  categoryLabel: string | null;
  responsibility: 'LANDLORD' | 'TENANT' | 'UNCLEAR';
  openToMarketplace: boolean;
  createdAt: string;
  artisanName?: string;
  artisanPhone?: string;
}

export const mockTickets: MockTicket[] = [
  {
    id: 'tk_seed_1',
    propertyId: 'p2',
    propertyTitle: 'Studio Apartment',
    raisedBy: 'Jennifer Adebayo',
    description: 'AC unit dripping water onto the floor',
    sourceMessage: 'WhatsApp: my AC dey leak water since yesterday',
    status: 'OPEN',
    proofPhotoUrls: [],
    tenantSignedOff: false,
    categoryId: null,
    categoryLabel: null,
    responsibility: 'UNCLEAR', // logged before the responsibility checklist existed
    openToMarketplace: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
];
