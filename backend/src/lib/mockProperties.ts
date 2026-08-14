// Shared mock property data (MOCK_MODE only), mutable so PATCH /api/properties/:id
// (advertise toggle, listing description) and the public listings endpoint
// both operate on the same records.

export interface MockProperty {
  id: string;
  title: string;
  address: string;
  state: string;
  lga: string;
  propertyType: 'LONG_TERM' | 'SHORT_LET';
  rentAmount: number;
  cautionDepositAmount: number;
  municipalId?: string;
  isAdvertised: boolean;
  listingDescription?: string;
  imageUrls: string[]; // empty until the landlord adds real photos — the gallery falls back to labeled placeholders
}

export const MOCK_PROPERTIES: MockProperty[] = [
  {
    id: 'p1',
    title: 'Luxury 3-Bedroom Apartment',
    address: 'Plot 12, Admiralty Way, Lekki Phase 1',
    state: 'Lagos',
    lga: 'Eti-Osa',
    propertyType: 'LONG_TERM',
    rentAmount: 6500000,
    cautionDepositAmount: 500000,
    municipalId: 'ETI-OSA/2024/00931',
    isAdvertised: false,
    imageUrls: [],
  },
  {
    id: 'p2',
    title: 'Studio Apartment',
    address: '18 Gana St, Maitama',
    state: 'FCT Abuja',
    lga: 'AMAC',
    propertyType: 'SHORT_LET',
    rentAmount: 75000,
    cautionDepositAmount: 150000,
    municipalId: 'AMAC/2024/04412',
    isAdvertised: false,
    imageUrls: [],
  },
  {
    id: 'p3',
    title: 'Serviced Flat',
    address: 'Plot 4, Trans-Amadi Road',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 4800000,
    cautionDepositAmount: 300000,
    municipalId: 'PH/2024/01187',
    isAdvertised: false,
    imageUrls: [],
  },
];
