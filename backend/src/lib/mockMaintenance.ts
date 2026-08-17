// In-memory (MOCK_MODE only) maintenance ticket store — its own module
// (rather than living inside routes/maintenance.ts) so lib/ownership.ts,
// routes/bookings.ts, and routes/public.ts can all import it without
// reaching into another router's file.

import { MOCK_PROPERTIES } from './mockProperties.js';
import { NIGERIA_STATES, type NigeriaState } from './nigeriaStates.js';
import { resolveCategory } from './repairChecklist.js';

export interface MockTicket {
  id: string;
  propertyId: string;
  propertyTitle?: string;
  state?: string; // denormalized from the property at creation, for direct per-state filtering
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

const CURATED_TICKETS: MockTicket[] = [
  {
    id: 'tk_seed_1',
    propertyId: 'p2',
    propertyTitle: 'Studio Apartment',
    state: 'FCT Abuja',
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

// --- Generated coverage: every state (and the FCT) gets a handful of open,
// marketplace-listed repair jobs so its /handymen/:state page isn't empty —
// same rationale as the property top-up in mockProperties.ts, built from a
// small set of realistic job templates rather than hand-authored.

const JOB_TEMPLATES: { categoryId: string; description: string }[] = [
  { categoryId: 'l-roof', description: 'Roof leaking into the living room after heavy rain' },
  { categoryId: 'l-gates-fences', description: 'Main gate lock is broken, compound not secure at night' },
  { categoryId: 'l-main-water', description: 'Water pressure very low across the whole building' },
  { categoryId: 'l-main-electrical', description: 'Main distribution board keeps tripping the whole flat' },
  { categoryId: 'l-external-walls', description: 'Boundary fence has a large crack and is leaning' },
  { categoryId: 'l-window-frames', description: "Window frame is rotten and won't close properly" },
  { categoryId: 'l-drainage', description: 'Compound drainage is blocked, water pooling after rain' },
  { categoryId: 'l-septic', description: 'Septic tank overflowing near the back of the property' },
  { categoryId: 'l-staircases', description: 'Staircase railing is loose and unsafe' },
  { categoryId: 'l-shared-flooring', description: 'Shared compound paving has cracked and sunk in one corner' },
];

const RAISED_BY_NAMES = [
  'Chidinma O.', 'Musa B.', 'Ngozi A.', 'Tunde F.', 'Blessing E.',
  'Ibrahim S.', 'Grace U.', 'Emeka N.', 'Fatima L.', 'Kelechi I.',
];

function generateTicketsForState(state: NigeriaState, properties: { id: string; title: string }[]): MockTicket[] {
  return JOB_TEMPLATES.map((template, i) => {
    const property = properties[i % properties.length];
    const { categoryLabel, responsibility } = resolveCategory(template.categoryId);
    return {
      id: `tk_${state.slug}_${String(i + 1).padStart(2, '0')}`,
      propertyId: property.id,
      propertyTitle: property.title,
      state: state.name,
      raisedBy: RAISED_BY_NAMES[i],
      description: template.description,
      status: 'OPEN',
      proofPhotoUrls: [],
      tenantSignedOff: false,
      categoryId: template.categoryId,
      categoryLabel,
      responsibility,
      openToMarketplace: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * ((i % 7) + 1)).toISOString(),
    };
  });
}

function buildSeededTickets(): MockTicket[] {
  const propertiesByState = new Map<string, { id: string; title: string }[]>();
  for (const p of MOCK_PROPERTIES) {
    if (!propertiesByState.has(p.state)) propertiesByState.set(p.state, []);
    propertiesByState.get(p.state)!.push({ id: p.id, title: p.title });
  }
  const generated: MockTicket[] = [];
  for (const state of NIGERIA_STATES) {
    const properties = propertiesByState.get(state.name);
    if (!properties?.length) continue;
    generated.push(...generateTicketsForState(state, properties));
  }
  return generated;
}

export const mockTickets: MockTicket[] = [...CURATED_TICKETS, ...buildSeededTickets()];
