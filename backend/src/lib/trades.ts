// The Artisan Network trade taxonomy — the single source of truth for the
// setup wizard's trade picker, the directory filters, and job matching. The
// `id` values are exactly the Prisma `Trade` enum. Grouped by the repair's
// usual owner, mirroring src/lib/repairChecklist.ts.

export type TradeId =
  | 'BRICKLAYER' | 'ROOFER' | 'POP_CEILING' | 'TILER' | 'ALUMINIUM_GLAZING'
  | 'WELDER_FABRICATOR' | 'BOREHOLE_WATER' | 'DRAINAGE_SOAKAWAY' | 'PAINTER'
  | 'ELECTRICIAN' | 'PLUMBER' | 'AC_TECHNICIAN' | 'GENERATOR_TECHNICIAN'
  | 'SOLAR_INVERTER' | 'CARPENTER_FURNITURE' | 'APPLIANCE_REPAIR' | 'LOCKSMITH'
  | 'DSTV_CCTV' | 'FUMIGATION_PEST' | 'CLEANING_POST_CONSTRUCTION'
  | 'GARDENER_LANDSCAPING' | 'INTERLOCKING_PAVING' | 'UPHOLSTERY';

export type TradeGroup = 'STRUCTURAL' | 'SYSTEMS';

export interface TradeDef {
  id: TradeId;
  label: string;
  group: TradeGroup;
  blurb: string;
}

export const TRADES: TradeDef[] = [
  { id: 'BRICKLAYER', label: 'Bricklayer / Mason', group: 'STRUCTURAL', blurb: 'Blockwork, plaster, screeding, cracks' },
  { id: 'ROOFER', label: 'Roofer', group: 'STRUCTURAL', blurb: 'Sheets, trusses, ridge caps, leaks' },
  { id: 'POP_CEILING', label: 'POP & Ceiling', group: 'STRUCTURAL', blurb: 'Plaster-of-Paris, screed ceilings, cornices' },
  { id: 'TILER', label: 'Tiler / Marble', group: 'STRUCTURAL', blurb: 'Floor & wall tiling, terrazzo, epoxy' },
  { id: 'ALUMINIUM_GLAZING', label: 'Aluminium & Glazing', group: 'STRUCTURAL', blurb: 'Windows, sliding doors, shopfronts' },
  { id: 'WELDER_FABRICATOR', label: 'Welder / Fabricator', group: 'STRUCTURAL', blurb: 'Gates, burglary proof, railings, tank stands' },
  { id: 'BOREHOLE_WATER', label: 'Borehole & Water', group: 'STRUCTURAL', blurb: 'Drilling, pumps, overhead tanks, treatment' },
  { id: 'DRAINAGE_SOAKAWAY', label: 'Drainage & Soakaway', group: 'STRUCTURAL', blurb: 'Septic, soakaway, channels, evacuation' },
  { id: 'PAINTER', label: 'Painter', group: 'STRUCTURAL', blurb: 'Emulsion, texture, screeding, POP finishing' },
  { id: 'ELECTRICIAN', label: 'Electrician', group: 'SYSTEMS', blurb: 'DBs, wiring, sockets, earthing, faults' },
  { id: 'PLUMBER', label: 'Plumber', group: 'SYSTEMS', blurb: 'Pipes, taps, WCs, water heaters, leaks' },
  { id: 'AC_TECHNICIAN', label: 'AC Technician', group: 'SYSTEMS', blurb: 'Split units, servicing, gas, installs' },
  { id: 'GENERATOR_TECHNICIAN', label: 'Generator Technician', group: 'SYSTEMS', blurb: 'Service, AVR, changeover, diesel & petrol' },
  { id: 'SOLAR_INVERTER', label: 'Solar & Inverter', group: 'SYSTEMS', blurb: 'Panels, batteries, inverters, load design' },
  { id: 'CARPENTER_FURNITURE', label: 'Carpenter / Furniture', group: 'SYSTEMS', blurb: 'Doors, wardrobes, kitchen cabinets' },
  { id: 'APPLIANCE_REPAIR', label: 'Appliance Repair', group: 'SYSTEMS', blurb: 'Fridge, washing machine, microwave, pump' },
  { id: 'LOCKSMITH', label: 'Locksmith', group: 'SYSTEMS', blurb: 'Locks, keys, digital locks, safes' },
  { id: 'DSTV_CCTV', label: 'DSTV / Aerial / CCTV', group: 'SYSTEMS', blurb: 'Dish align, CCTV, intercom, access control' },
  { id: 'FUMIGATION_PEST', label: 'Fumigation & Pest', group: 'SYSTEMS', blurb: 'Roaches, rodents, termites, pre-tenancy' },
  { id: 'CLEANING_POST_CONSTRUCTION', label: 'Cleaning & Post-Construction', group: 'SYSTEMS', blurb: 'Move-in/out deep clean, debris haulage' },
  { id: 'GARDENER_LANDSCAPING', label: 'Gardener / Landscaping', group: 'SYSTEMS', blurb: 'Lawns, hedges, compound upkeep' },
  { id: 'INTERLOCKING_PAVING', label: 'Interlocking & Paving', group: 'SYSTEMS', blurb: 'Driveways, kerbs, compound flooring' },
  { id: 'UPHOLSTERY', label: 'Upholstery', group: 'SYSTEMS', blurb: 'Sofa re-covering, curtains, blinds, foam' },
];

export const TRADE_IDS = new Set(TRADES.map((t) => t.id));

export function isTradeId(v: unknown): v is TradeId {
  return typeof v === 'string' && TRADE_IDS.has(v as TradeId);
}

export function tradeLabel(id: string): string {
  return TRADES.find((t) => t.id === id)?.label ?? id;
}
