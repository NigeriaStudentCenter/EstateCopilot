// Shared mock property data (MOCK_MODE only), mutable so PATCH /api/properties/:id
// (advertise toggle, listing description) and the public listings endpoint
// both operate on the same records.

import { DEMO_LANDLORD_ID } from './mockLandlords.js';
import { NIGERIA_STATES, type NigeriaState, type StateTier } from './nigeriaStates.js';

export interface MockProperty {
  id: string;
  landlordId: string;
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

const W = '?w=1200';

const CURATED_PROPERTIES: MockProperty[] = [
  {
    id: 'p1',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Luxury 3-Bedroom Apartment',
    address: 'Plot 12, Admiralty Way, Lekki Phase 1',
    state: 'Lagos',
    lga: 'Eti-Osa',
    propertyType: 'LONG_TERM',
    rentAmount: 6500000,
    cautionDepositAmount: 500000,
    municipalId: 'ETI-OSA/2024/00931',
    isAdvertised: true,
    listingDescription: 'Spacious 3-bedroom apartment in Lekki Phase 1 — full building tour below: living room, kitchen, bedroom, and exterior.',
    imageUrls: [
      `https://images.unsplash.com/photo-1560448204-e02f11c3d0e2${W}`,
      `https://images.unsplash.com/photo-1493809842364-78817add7ffb${W}`,
      `https://images.unsplash.com/photo-1522708323590-d24dbb6b0267${W}`,
      `https://images.unsplash.com/photo-1512917774080-9991f1c4c750${W}`,
    ],
  },
  {
    id: 'p2',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Studio Apartment',
    address: '18 Gana St, Maitama',
    state: 'FCT Abuja',
    lga: 'AMAC',
    propertyType: 'SHORT_LET',
    rentAmount: 75000,
    cautionDepositAmount: 150000,
    municipalId: 'AMAC/2024/04412',
    isAdvertised: true,
    listingDescription: 'Modern studio in Maitama, Abuja — compact, fully finished, walk through every corner below.',
    imageUrls: [
      `https://images.unsplash.com/photo-1600585154340-be6161a56a0c${W}`,
      `https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e${W}`,
      `https://images.unsplash.com/photo-1502672260266-1c1ef2d93688${W}`,
      `https://images.unsplash.com/photo-1571055107559-3e67626fa8be${W}`,
    ],
  },
  {
    id: 'p3',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Serviced Flat',
    address: 'Plot 4, Trans-Amadi Road',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 4800000,
    cautionDepositAmount: 300000,
    municipalId: 'PH/2024/01187',
    isAdvertised: true,
    listingDescription: 'Serviced flat on Trans-Amadi Road, Port Harcourt — bright interiors and secure compound, see the full gallery below.',
    imageUrls: [
      `https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83${W}`,
      `https://images.unsplash.com/photo-1484101403633-562f891dc89a${W}`,
      `https://images.unsplash.com/photo-1554995207-c18c203602cb${W}`,
      `https://images.unsplash.com/photo-1523217582562-09d0def993a6${W}`,
    ],
  },
  {
    id: 'p4',
    landlordId: DEMO_LANDLORD_ID,
    title: '2-Bedroom Flat, GRA Phase 2',
    address: '9 Aggrey Road, GRA Phase 2',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 2800000,
    cautionDepositAmount: 200000,
    municipalId: 'PH/2024/02001',
    isAdvertised: true,
    listingDescription: 'Quiet 2-bedroom flat in GRA Phase 2 — close to schools and the waterfront, freshly repainted.',
    imageUrls: [
      `https://images.unsplash.com/photo-1560448204-e02f11c3d0e2${W}`,
      `https://images.unsplash.com/photo-1600585154340-be6161a56a0c${W}`,
      `https://images.unsplash.com/photo-1502672260266-1c1ef2d93688${W}`,
      `https://images.unsplash.com/photo-1522708323590-d24dbb6b0267${W}`,
    ],
  },
  {
    id: 'p5',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Self-Contained Studio, D-Line',
    address: '22 Evo Road, D-Line',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'SHORT_LET',
    rentAmount: 60000,
    cautionDepositAmount: 100000,
    municipalId: 'PH/2024/02002',
    isAdvertised: true,
    listingDescription: 'Self-contained studio in the heart of D-Line — walking distance to Genesis Centre and major banks.',
    imageUrls: [
      `https://images.unsplash.com/photo-1522708323590-d24dbb6b0267${W}`,
      `https://images.unsplash.com/photo-1493809842364-78817add7ffb${W}`,
      `https://images.unsplash.com/photo-1512917774080-9991f1c4c750${W}`,
      `https://images.unsplash.com/photo-1571055107559-3e67626fa8be${W}`,
    ],
  },
  {
    id: 'p6',
    landlordId: DEMO_LANDLORD_ID,
    title: '3-Bedroom Duplex, Old GRA',
    address: '5 Forces Avenue, Old GRA',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 5200000,
    cautionDepositAmount: 400000,
    municipalId: 'PH/2024/02003',
    isAdvertised: true,
    listingDescription: 'Executive 3-bedroom duplex in Old GRA with a private compound and 24-hour security.',
    imageUrls: [
      `https://images.unsplash.com/photo-1571055107559-3e67626fa8be${W}`,
      `https://images.unsplash.com/photo-1484154218962-a197022b5858${W}`,
      `https://images.unsplash.com/photo-1484101403633-562f891dc89a${W}`,
      `https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e${W}`,
    ],
  },
  {
    id: 'p7',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Mini Flat, Rumuola',
    address: '14 Ada George Road, Rumuola',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'SHORT_LET',
    rentAmount: 45000,
    cautionDepositAmount: 90000,
    municipalId: 'PH/2024/02004',
    isAdvertised: true,
    listingDescription: 'Tidy mini flat off Ada George Road in Rumuola — great for a short stay near the business district.',
    imageUrls: [
      `https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e${W}`,
      `https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83${W}`,
      `https://images.unsplash.com/photo-1560184897-ae75f418493e${W}`,
      `https://images.unsplash.com/photo-1523217582562-09d0def993a6${W}`,
    ],
  },
  {
    id: 'p8',
    landlordId: DEMO_LANDLORD_ID,
    title: '4-Bedroom Terrace, Woji',
    address: '3 Peter Odili Road, Woji',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 6000000,
    cautionDepositAmount: 500000,
    municipalId: 'PH/2024/02005',
    isAdvertised: true,
    listingDescription: 'Roomy 4-bedroom terrace house in Woji, ideal for a family — fitted kitchen and BQ included.',
    imageUrls: [
      `https://images.unsplash.com/photo-1523217582562-09d0def993a6${W}`,
      `https://images.unsplash.com/photo-1502672023488-70e25813eb80${W}`,
      `https://images.unsplash.com/photo-1554995207-c18c203602cb${W}`,
      `https://images.unsplash.com/photo-1598928506311-c55ded91a20c${W}`,
    ],
  },
  {
    id: 'p9',
    landlordId: DEMO_LANDLORD_ID,
    title: '1-Bedroom Apartment, Ada George',
    address: '31 Ada George Road',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 1800000,
    cautionDepositAmount: 150000,
    municipalId: 'PH/2024/02006',
    isAdvertised: true,
    listingDescription: 'Affordable 1-bedroom apartment on Ada George Road, close to shopping and transport links.',
    imageUrls: [
      `https://images.unsplash.com/photo-1598928506311-c55ded91a20c${W}`,
      `https://images.unsplash.com/photo-1494526585095-c41746248156${W}`,
      `https://images.unsplash.com/photo-1615873968403-89e068629265${W}`,
      `https://images.unsplash.com/photo-1600607687939-ce8a6c25118c${W}`,
    ],
  },
  {
    id: 'p10',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Executive Studio, Eliozu',
    address: '7 Airport Road, Eliozu',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'SHORT_LET',
    rentAmount: 55000,
    cautionDepositAmount: 110000,
    municipalId: 'PH/2024/02007',
    isAdvertised: true,
    listingDescription: 'Modern executive studio near Eliozu junction — new fittings throughout, ready to move in.',
    imageUrls: [
      `https://images.unsplash.com/photo-1600607687939-ce8a6c25118c${W}`,
      `https://images.unsplash.com/photo-1592595896616-c37162298647${W}`,
      `https://images.unsplash.com/photo-1560448204-e02f11c3d0e2${W}`,
      `https://images.unsplash.com/photo-1600585154340-be6161a56a0c${W}`,
    ],
  },
  {
    id: 'p11',
    landlordId: DEMO_LANDLORD_ID,
    title: '2-Bedroom Bungalow, Rumuokwuta',
    address: '16 Elelenwo Street, Rumuokwuta',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 2200000,
    cautionDepositAmount: 180000,
    municipalId: 'PH/2024/02008',
    isAdvertised: true,
    listingDescription: 'Cosy 2-bedroom bungalow in a gated Rumuokwuta estate, with space for a small garden.',
    imageUrls: [
      `https://images.unsplash.com/photo-1600585154340-be6161a56a0c${W}`,
      `https://images.unsplash.com/photo-1502672260266-1c1ef2d93688${W}`,
      `https://images.unsplash.com/photo-1522708323590-d24dbb6b0267${W}`,
      `https://images.unsplash.com/photo-1493809842364-78817add7ffb${W}`,
    ],
  },
  {
    id: 'p12',
    landlordId: DEMO_LANDLORD_ID,
    title: '3-Bedroom Flat, Peter Odili Road',
    address: '48 Peter Odili Road',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 4500000,
    cautionDepositAmount: 350000,
    municipalId: 'PH/2024/02009',
    isAdvertised: true,
    listingDescription: 'Well-finished 3-bedroom flat directly on Peter Odili Road, close to shopping malls and offices.',
    imageUrls: [
      `https://images.unsplash.com/photo-1493809842364-78817add7ffb${W}`,
      `https://images.unsplash.com/photo-1512917774080-9991f1c4c750${W}`,
      `https://images.unsplash.com/photo-1571055107559-3e67626fa8be${W}`,
      `https://images.unsplash.com/photo-1484154218962-a197022b5858${W}`,
    ],
  },
  {
    id: 'p13',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Serviced Studio, Choba',
    address: '2 University Road, Choba',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'SHORT_LET',
    rentAmount: 50000,
    cautionDepositAmount: 100000,
    municipalId: 'PH/2024/02010',
    isAdvertised: true,
    listingDescription: 'Serviced studio near Choba — a short walk to the university, popular with visiting professionals.',
    imageUrls: [
      `https://images.unsplash.com/photo-1484154218962-a197022b5858${W}`,
      `https://images.unsplash.com/photo-1484101403633-562f891dc89a${W}`,
      `https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e${W}`,
      `https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83${W}`,
    ],
  },
  {
    id: 'p14',
    landlordId: DEMO_LANDLORD_ID,
    title: '2-Bedroom Apartment, Rumuomasi',
    address: '11 Elelenwo Road, Rumuomasi',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 2600000,
    cautionDepositAmount: 220000,
    municipalId: 'PH/2024/02011',
    isAdvertised: true,
    listingDescription: 'Well-maintained 2-bedroom apartment in Rumuomasi, on a tarred, gated street.',
    imageUrls: [
      `https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83${W}`,
      `https://images.unsplash.com/photo-1560184897-ae75f418493e${W}`,
      `https://images.unsplash.com/photo-1523217582562-09d0def993a6${W}`,
      `https://images.unsplash.com/photo-1502672023488-70e25813eb80${W}`,
    ],
  },
  {
    id: 'p15',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Luxury Duplex, New GRA',
    address: '6 Woji Road, New GRA',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 7500000,
    cautionDepositAmount: 600000,
    municipalId: 'PH/2024/02012',
    isAdvertised: true,
    listingDescription: 'High-end duplex in New GRA with a fitted kitchen, staff quarters, and a paved compound.',
    imageUrls: [
      `https://images.unsplash.com/photo-1502672023488-70e25813eb80${W}`,
      `https://images.unsplash.com/photo-1554995207-c18c203602cb${W}`,
      `https://images.unsplash.com/photo-1598928506311-c55ded91a20c${W}`,
      `https://images.unsplash.com/photo-1494526585095-c41746248156${W}`,
    ],
  },
  {
    id: 'p16',
    landlordId: DEMO_LANDLORD_ID,
    title: 'Mini Flat, Elelenwo',
    address: '19 Elelenwo Housing Estate',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'SHORT_LET',
    rentAmount: 40000,
    cautionDepositAmount: 80000,
    municipalId: 'PH/2024/02013',
    isAdvertised: true,
    listingDescription: 'Budget-friendly mini flat within Elelenwo Housing Estate, secure and easy to reach.',
    imageUrls: [
      `https://images.unsplash.com/photo-1494526585095-c41746248156${W}`,
      `https://images.unsplash.com/photo-1615873968403-89e068629265${W}`,
      `https://images.unsplash.com/photo-1600607687939-ce8a6c25118c${W}`,
      `https://images.unsplash.com/photo-1592595896616-c37162298647${W}`,
    ],
  },
  {
    id: 'p17',
    landlordId: DEMO_LANDLORD_ID,
    title: '3-Bedroom Flat, Ogbunabali',
    address: '27 Ogbunabali Road',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'LONG_TERM',
    rentAmount: 3800000,
    cautionDepositAmount: 300000,
    municipalId: 'PH/2024/02014',
    isAdvertised: true,
    listingDescription: 'Comfortable 3-bedroom flat on Ogbunabali Road, minutes from the city centre.',
    imageUrls: [
      `https://images.unsplash.com/photo-1592595896616-c37162298647${W}`,
      `https://images.unsplash.com/photo-1560448204-e02f11c3d0e2${W}`,
      `https://images.unsplash.com/photo-1600585154340-be6161a56a0c${W}`,
      `https://images.unsplash.com/photo-1502672260266-1c1ef2d93688${W}`,
    ],
  },
  {
    id: 'p18',
    landlordId: DEMO_LANDLORD_ID,
    title: '1-Bedroom Self-Contain, Rumuigbo',
    address: '8 Rumuigbo Road',
    state: 'Rivers',
    lga: 'Port Harcourt',
    propertyType: 'SHORT_LET',
    rentAmount: 48000,
    cautionDepositAmount: 95000,
    municipalId: 'PH/2024/02015',
    isAdvertised: true,
    listingDescription: 'Bright 1-bedroom self-contain in Rumuigbo, freshly furnished and ready for a short stay.',
    imageUrls: [
      `https://images.unsplash.com/photo-1502672260266-1c1ef2d93688${W}`,
      `https://images.unsplash.com/photo-1522708323590-d24dbb6b0267${W}`,
      `https://images.unsplash.com/photo-1493809842364-78817add7ffb${W}`,
      `https://images.unsplash.com/photo-1512917774080-9991f1c4c750${W}`,
    ],
  },
];

// --- Generated coverage: every state (and the FCT) needs at least
// MIN_PER_STATE properties so its /properties/:state page isn't empty, but
// hand-authoring ~360 more listings isn't reasonable — these are built
// deterministically from a small set of templates instead. Lagos/FCT
// Abuja/Rivers already have curated listings above; this only tops each
// state up to the minimum, never removes or duplicates a curated one.

const STREET_NAMES = [
  'Awolowo', 'Ahmadu Bello', 'Adeola Odeku', 'Ibrahim Taiwo', 'Muritala Mohammed',
  'Zik Avenue', 'Yakubu Gowon', 'Constitution', 'Ademola', 'Broad',
];

const IMAGE_POOL = [
  '1560448204-e02f11c3d0e2', '1493809842364-78817add7ffb', '1522708323590-d24dbb6b0267',
  '1512917774080-9991f1c4c750', '1600585154340-be6161a56a0c', '1567767292278-a4f21aa2d36e',
  '1502672260266-1c1ef2d93688', '1571055107559-3e67626fa8be', '1583608205776-bfd35f0d9f83',
  '1484101403633-562f891dc89a', '1554995207-c18c203602cb', '1523217582562-09d0def993a6',
  '1484154218962-a197022b5858', '1560184897-ae75f418493e', '1502672023488-70e25813eb80',
  '1598928506311-c55ded91a20c', '1494526585095-c41746248156', '1615873968403-89e068629265',
  '1600607687939-ce8a6c25118c', '1592595896616-c37162298647',
];

interface PropertyTemplate {
  label: string;
  type: 'LONG_TERM' | 'SHORT_LET';
  baseRent: number;
  baseDeposit: number;
}

const PROPERTY_TEMPLATES: PropertyTemplate[] = [
  { label: 'Studio Apartment', type: 'SHORT_LET', baseRent: 35000, baseDeposit: 70000 },
  { label: 'Mini Flat', type: 'SHORT_LET', baseRent: 45000, baseDeposit: 90000 },
  { label: 'Self-Contained Studio', type: 'SHORT_LET', baseRent: 40000, baseDeposit: 80000 },
  { label: 'Executive Studio', type: 'SHORT_LET', baseRent: 55000, baseDeposit: 110000 },
  { label: 'Serviced Apartment', type: 'SHORT_LET', baseRent: 60000, baseDeposit: 120000 },
  { label: '1-Bedroom Apartment', type: 'LONG_TERM', baseRent: 900000, baseDeposit: 150000 },
  { label: '2-Bedroom Flat', type: 'LONG_TERM', baseRent: 1800000, baseDeposit: 250000 },
  { label: '2-Bedroom Bungalow', type: 'LONG_TERM', baseRent: 2000000, baseDeposit: 280000 },
  { label: '3-Bedroom Flat', type: 'LONG_TERM', baseRent: 3000000, baseDeposit: 350000 },
  { label: '3-Bedroom Duplex', type: 'LONG_TERM', baseRent: 3800000, baseDeposit: 400000 },
  { label: '4-Bedroom Terrace', type: 'LONG_TERM', baseRent: 4800000, baseDeposit: 500000 },
  { label: 'Luxury Duplex', type: 'LONG_TERM', baseRent: 6500000, baseDeposit: 650000 },
];

const TIER_MULTIPLIER: Record<StateTier, number> = { premium: 2.2, upper: 1.3, standard: 1 };

function round(n: number): number {
  return Math.round(n / 1000) * 1000;
}

function imagesFor(seed: number): string[] {
  return [0, 1, 2, 3].map((i) => `https://images.unsplash.com/photo-${IMAGE_POOL[(seed + i) % IMAGE_POOL.length]}${W}`);
}

function generatePropertiesForState(state: NigeriaState, startIndex: number, count: number): MockProperty[] {
  const out: MockProperty[] = [];
  for (let i = 0; i < count; i++) {
    const n = startIndex + i;
    const template = PROPERTY_TEMPLATES[(n - 1) % PROPERTY_TEMPLATES.length];
    const lga = state.lgas[(n - 1) % state.lgas.length];
    const street = STREET_NAMES[(n * 3 + state.slug.length) % STREET_NAMES.length];
    const houseNo = 3 + ((n * 7) % 47);
    const multiplier = TIER_MULTIPLIER[state.tier];
    const rentAmount = round(template.baseRent * multiplier);
    const cautionDepositAmount = round(template.baseDeposit * multiplier);
    out.push({
      id: `p_${state.slug}_${String(n).padStart(2, '0')}`,
      landlordId: DEMO_LANDLORD_ID,
      title: `${template.label}, ${lga}`,
      address: `${houseNo} ${street} Street`, // LGA is a separate field, and the UI appends it to the address itself
      state: state.name,
      lga,
      propertyType: template.type,
      rentAmount,
      cautionDepositAmount,
      municipalId: `${state.slug.slice(0, 3).toUpperCase()}/2024/${String(1000 + n).slice(-4)}`,
      isAdvertised: true,
      listingDescription: `${template.label} in ${lga}, ${state.name} — well-kept and ready to view.`,
      imageUrls: imagesFor(n + state.slug.length),
    });
  }
  return out;
}

const MIN_PER_STATE = 10;

function buildTopUpProperties(): MockProperty[] {
  const countByState = new Map<string, number>();
  for (const p of CURATED_PROPERTIES) {
    countByState.set(p.state, (countByState.get(p.state) ?? 0) + 1);
  }
  const generated: MockProperty[] = [];
  for (const state of NIGERIA_STATES) {
    const existing = countByState.get(state.name) ?? 0;
    if (existing >= MIN_PER_STATE) continue;
    generated.push(...generatePropertiesForState(state, existing + 1, MIN_PER_STATE - existing));
  }
  return generated;
}

export const MOCK_PROPERTIES: MockProperty[] = [...CURATED_PROPERTIES, ...buildTopUpProperties()];
