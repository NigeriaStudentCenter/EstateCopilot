// Shared source of truth for "who fixes this" — used by the tenant portal's
// repair-report picker, the landlord portal's manual ticket form, and to
// derive MaintenanceTicket.responsibility server-side (never trust the
// client to self-report who's on the hook for a repair).

export type Responsibility = 'LANDLORD' | 'TENANT';

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

export interface ResponsibilityChecklist {
  responsibility: Responsibility;
  title: string;
  sections: ChecklistSection[];
}

export const LANDLORD_CHECKLIST: ResponsibilityChecklist = {
  responsibility: 'LANDLORD',
  title: "Landlord's responsibility — structural & core building",
  sections: [
    {
      title: 'Foundation & Core Structure',
      items: [
        { id: 'l-foundation', label: 'Foundation repairs (major structural cracking, sinking, or instability)' },
        { id: 'l-load-bearing-walls', label: 'Load-bearing walls (structural cracks or risk of wall collapse)' },
        { id: 'l-beams-columns', label: 'Beams and structural columns' },
        { id: 'l-subfloors', label: 'Subfloors and main concrete floor slabs' },
      ],
    },
    {
      title: 'Roofing & External Shell',
      items: [
        { id: 'l-roof', label: 'Roof repairs or replacement (leaks, blown-off sheets, damaged trusses)' },
        { id: 'l-external-walls', label: 'External walls and plastering' },
        { id: 'l-gates-fences', label: 'External doors, main entrance gates, and security fences' },
        { id: 'l-window-frames', label: 'Window frames and external glass structures' },
      ],
    },
    {
      title: 'Main Utilities & Underground Infrastructure',
      items: [
        { id: 'l-main-water', label: 'Main water supply lines and main plumbing (underground bursts, main supply leaks)' },
        { id: 'l-septic', label: 'Septic tank, soakaway, and main sewage system failures' },
        { id: 'l-water-tank-stand', label: 'Overhead water tank stand/structure repair' },
        { id: 'l-main-electrical', label: 'Main electrical distribution board and main supply wiring (before individual meters)' },
      ],
    },
    {
      title: 'Common Areas & Shared Spaces (Flats / Estates)',
      items: [
        { id: 'l-staircases', label: 'Staircases, railings, and common corridors' },
        { id: 'l-shared-flooring', label: 'Shared compound flooring/paving' },
        { id: 'l-drainage', label: 'External drainage channels and gutter systems' },
      ],
    },
  ],
};

export const TENANT_CHECKLIST: ResponsibilityChecklist = {
  responsibility: 'TENANT',
  title: "Tenant's responsibility — day-to-day upkeep",
  sections: [
    {
      title: 'Electrical & Lighting',
      items: [
        { id: 't-bulbs', label: 'Replacing light bulbs, tubes, and starters' },
        { id: 't-sockets', label: 'Replacing broken wall sockets, light switches, or cover plates inside the apartment' },
        { id: 't-fuses', label: "Replacing blown fuses or resetting tripped breakers within the flat's distribution box" },
        { id: 't-appliances', label: 'Repairing or replacing damaged appliances owned by the tenant (A/Cs, water heaters, etc.)' },
      ],
    },
    {
      title: 'Internal Plumbing & Fixtures',
      items: [
        { id: 't-blockages', label: 'Unclogging minor blockages in sinks, washbasins, showers, or toilet bowls from daily use' },
        { id: 't-tap-washers', label: 'Replacing worn-out tap washers, leaking faucet heads, or sink strainers' },
        { id: 't-toilet-parts', label: 'Replacing broken toilet seat covers, flush handles, or internal flush valves' },
        { id: 't-hose-connectors', label: 'Fixing flexible hose connectors under sinks or toilets' },
      ],
    },
    {
      title: 'Interior Fittings & Hardware',
      items: [
        { id: 't-locks', label: 'Replacing lost keys or damaged door lock cylinders/handles for interior doors' },
        { id: 't-hinges', label: 'Repairing minor interior door hinge issues or cabinet latches' },
        { id: 't-glass-panes', label: 'Replacing broken window glass panes damaged during tenancy' },
        { id: 't-curtains', label: 'Maintaining curtain rods, blinds, and interior wall fixtures installed by the tenant' },
      ],
    },
    {
      title: 'Cleaning, Pest Control & Upkeep',
      items: [
        { id: 't-cleaning', label: 'Routine interior cleaning (keeping the premises clean and sanitary)' },
        { id: 't-pest-control', label: 'Regular pest control for minor infestations arising during occupancy' },
        { id: 't-balcony', label: 'Routine clearing of immediate balconies or private outdoor areas assigned to the unit' },
      ],
    },
    {
      title: 'Tenant-Caused Damage & Alterations',
      items: [
        { id: 't-wall-patching', label: 'Patching up and repainting wall holes made by nails, screws, or TV wall mounts' },
        { id: 't-restore-alterations', label: 'Restoring unauthorized alterations back to original state upon moving out' },
        { id: 't-negligence-damage', label: 'Fixing structural damage caused by tenant negligence (e.g. water overflow damaging flooring)' },
      ],
    },
  ],
};

export const CHECKLISTS = [LANDLORD_CHECKLIST, TENANT_CHECKLIST];

const ITEM_INDEX = new Map<string, { label: string; responsibility: Responsibility }>();
for (const checklist of CHECKLISTS) {
  for (const section of checklist.sections) {
    for (const item of section.items) {
      ITEM_INDEX.set(item.id, { label: item.label, responsibility: checklist.responsibility });
    }
  }
}

// The only trusted way to turn a tenant's selection into a responsibility
// verdict — looked up server-side so a client can never claim "landlord"
// for something that's actually theirs to maintain.
export function resolveCategory(categoryId: string | undefined): {
  categoryId: string;
  categoryLabel: string;
  responsibility: 'LANDLORD' | 'TENANT' | 'UNCLEAR';
} {
  if (categoryId && ITEM_INDEX.has(categoryId)) {
    const entry = ITEM_INDEX.get(categoryId)!;
    return { categoryId, categoryLabel: entry.label, responsibility: entry.responsibility };
  }
  return { categoryId: 'other', categoryLabel: 'Something else / not sure', responsibility: 'UNCLEAR' };
}
