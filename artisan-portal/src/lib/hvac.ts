// Air-conditioner sizing: the cooling load of a room, the standard AC size to fit, and what it draws. Pure functions, no React.
// Tests: artisan-portal/scripts/hvac-check.mts.
//
// Method (a transparent simplified load calculation, in watts, then converted to BTU/h):
//   walls and roof : U x area x (outdoor - indoor + an allowance for the sun on that surface)
//   windows        : conduction (U x area x dT) + sun through the glass (SHGC x shading x sun strength x area)
//   people, lights, equipment : their heat
//   fresh air      : room volume x air changes per hour x the heat in each m3/h of outdoor air (hotter and wetter outside = more)
//   then +10% for the unknowns. 1 W = 3.412 BTU/h.
// It is an estimate for choosing a size. A full Manual J/ASHRAE calculation, the installer's site visit and the
// manufacturer's data win, and an oversized or undersized unit is only a guide to the next size up or down.

export type Climate = 'COASTAL' | 'INLAND' | 'NORTH';
export type Side = 'N' | 'E' | 'S' | 'W';
export type RoofKind = 'ROOM_ABOVE' | 'SLAB' | 'CEILING_VENTED' | 'CEILING_INSULATED' | 'NO_CEILING';
export type WallKind = 'BLOCK9' | 'BLOCK6' | 'INSULATED';
export type GlassKind = 'CLEAR' | 'TINTED' | 'DOUBLE';
export type ShadeKind = 'NONE' | 'CURTAIN' | 'FILM' | 'OVERHANG';
export type UseKind = 'BEDROOM' | 'LIVING' | 'OFFICE' | 'SHOP' | 'RESTAURANT';
export type AcType = 'FIXED' | 'INVERTER';

export const CLIMATE: Record<Climate, { label: string; outdoorC: number; wPerM3h: number; where: string }> = {
  COASTAL: { label: 'Coastal and humid', outdoorC: 33, wPerM3h: 16, where: 'Lagos, Port Harcourt, Calabar, Warri, Uyo' },
  INLAND: { label: 'Inland', outdoorC: 34, wPerM3h: 11, where: 'Abuja, Ibadan, Enugu, Benin, Ilorin, Jos' },
  NORTH: { label: 'Hot and dry north', outdoorC: 38, wPerM3h: 7.5, where: 'Kano, Sokoto, Maiduguri, Katsina' },
};
const COASTAL = new Set(['lagos', 'rivers', 'bayelsa', 'delta', 'akwa ibom', 'cross river', 'ogun', 'ondo', 'edo']);
const NORTH = new Set(['sokoto', 'kebbi', 'zamfara', 'katsina', 'kano', 'jigawa', 'yobe', 'borno', 'bauchi', 'gombe']);
export function climateFor(state: string): Climate {
  const s = state.toLowerCase().replace(/\bstate\b/g, '').trim();
  return COASTAL.has(s) ? 'COASTAL' : NORTH.has(s) ? 'NORTH' : 'INLAND';
}

// How much hotter than the air a sunlit surface behaves at the afternoon peak (K), by the side it faces.
export const SUN_EXTRA: Record<Side, number> = { N: 2, E: 5, S: 4, W: 8 };
// Sun strength on glass at the afternoon peak (W/m2).
export const SUN_W: Record<Side, number> = { N: 150, E: 450, S: 300, W: 550 };
export const WALL_U: Record<WallKind, number> = { BLOCK9: 2.3, BLOCK6: 2.9, INSULATED: 0.8 };
export const WALL_LABEL: Record<WallKind, string> = { BLOCK9: '9 inch sandcrete, plastered', BLOCK6: '6 inch sandcrete, plastered', INSULATED: 'Insulated wall' };
// U value and the extra sun allowance (K) for what is above the room.
export const ROOF: Record<RoofKind, { u: number; extra: number; label: string }> = {
  ROOM_ABOVE: { u: 0, extra: 0, label: 'Another room or floor above' },
  SLAB: { u: 2.4, extra: 15, label: 'Concrete roof slab (top floor)' },
  CEILING_VENTED: { u: 2.0, extra: 12, label: 'Ceiling under metal roof' },
  CEILING_INSULATED: { u: 0.7, extra: 12, label: 'Insulated ceiling under metal roof' },
  NO_CEILING: { u: 4.5, extra: 20, label: 'Metal roof, no ceiling' },
};
export const GLASS: Record<GlassKind, { u: number; shgc: number; label: string }> = {
  CLEAR: { u: 5.8, shgc: 0.8, label: 'Clear glass' },
  TINTED: { u: 5.8, shgc: 0.55, label: 'Tinted glass' },
  DOUBLE: { u: 2.9, shgc: 0.55, label: 'Double glazed' },
};
export const SHADE: Record<ShadeKind, { f: number; label: string }> = {
  NONE: { f: 1, label: 'No shading' }, CURTAIN: { f: 0.7, label: 'Curtains' }, FILM: { f: 0.6, label: 'Window film' }, OVERHANG: { f: 0.5, label: 'Overhang' },
};
export const USE: Record<UseKind, { label: string; ach: number; people: number }> = {
  BEDROOM: { label: 'Bedroom', ach: 0.4, people: 2 },
  LIVING: { label: 'Living room', ach: 0.6, people: 4 },
  OFFICE: { label: 'Office', ach: 0.6, people: 3 },
  SHOP: { label: 'Shop (door opens often)', ach: 1.2, people: 4 },
  RESTAURANT: { label: 'Restaurant / event room', ach: 1.5, people: 10 },
};
export const PERSON_W = 130; // sensible + latent heat of a seated or light-working adult
export const LIGHT_W_PER_M2 = 6;
export const SAFETY_PCT = 10;
export const W_TO_BTU = 3.412;

export interface Equip { name: string; watts: number; qty: number }
export const EQUIPMENT_PRESETS: { name: string; watts: number }[] = [
  { name: 'TV', watts: 100 }, { name: 'Desktop computer', watts: 150 }, { name: 'Laptop', watts: 50 }, { name: 'Fridge', watts: 100 },
  { name: 'Freezer', watts: 150 }, { name: 'Printer / copier', watts: 100 }, { name: 'Microwave', watts: 150 }, { name: 'Server / network rack', watts: 500 },
  { name: 'Cooking (gas or electric)', watts: 1500 }, { name: 'Display fridge', watts: 250 },
];

export interface Room {
  id: string; name: string;
  lengthM: number; widthM: number; heightM: number;
  roof: RoofKind; wallKind: WallKind;
  walls: Record<Side, number>; // length (m) of exposed outside wall facing each side
  windows: Record<Side, number>; // window area (m2) on each side
  glass: GlassKind; shade: ShadeKind;
  use: UseKind; people: number; lightingW: number; equipment: Equip[];
  acType: AcType; hoursPerDay: number;
  chosenBtu: number | null; // an AC size the customer already has or wants, to compare
}

export const newRoom = (id: string, name = 'Room'): Room => ({
  id, name, lengthM: 4, widthM: 4, heightM: 3, roof: 'ROOM_ABOVE', wallKind: 'BLOCK9',
  walls: { N: 0, E: 0, S: 0, W: 4 }, windows: { N: 0, E: 0, S: 0, W: 1.5 }, glass: 'CLEAR', shade: 'CURTAIN',
  use: 'BEDROOM', people: USE.BEDROOM.people, lightingW: 96, equipment: [], acType: 'INVERTER', hoursPerDay: 8, chosenBtu: null,
});

export interface Ctx { climate: Climate; indoorC: number }
export const newCtx = (climate: Climate): Ctx => ({ climate, indoorC: 24 });

const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round = (x: number, dp = 0) => { const f = 10 ** dp; return Math.round(x * f) / f; };

export const SIZES: { btu: number; hp: string }[] = [
  { btu: 9000, hp: '1 HP' }, { btu: 12000, hp: '1.5 HP' }, { btu: 18000, hp: '2 HP' }, { btu: 24000, hp: '2.5 HP' },
  { btu: 30000, hp: '3 HP' }, { btu: 36000, hp: '4 HP' }, { btu: 48000, hp: '5 HP' }, { btu: 60000, hp: '5 ton' },
];
export const hpLabel = (btu: number) => SIZES.find((s) => s.btu === btu)?.hp ?? `${round(btu / 12000, 1)} ton`;

export interface Part { key: 'walls' | 'roof' | 'glass' | 'people' | 'lighting' | 'equipment' | 'ventilation'; label: string; w: number }
export interface Electrical { runningW: number; amps: number; breakerA: number; cableMm2: number; surgeW: number; kwhPerDay: number }
export interface Sizing { units: number; perUnitBtu: number; hp: string; btu: number }
export interface RoomResult {
  areaM2: number; volumeM3: number; deltaT: number; parts: Part[]; subtotalW: number; totalW: number; btu: number;
  sizing: Sizing; electrical: Electrical; fit: 'NONE' | 'UNDER' | 'SLIGHTLY_UNDER' | 'GOOD' | 'OVER'; coverage: number | null; warnings: string[];
}

const BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63];
const cableFor = (a: number) => (a <= 20 ? 2.5 : a <= 25 ? 4 : a <= 32 ? 6 : 10);

export function sizeFor(btu: number): Sizing {
  if (btu <= 0) return { units: 0, perUnitBtu: 0, hp: '', btu: 0 };
  const units = btu > 36000 ? Math.ceil(btu / 36000) : 1;
  const per = btu / units;
  const std = SIZES.find((s) => s.btu >= per * 0.97) ?? SIZES[SIZES.length - 1];
  return { units, perUnitBtu: std.btu, hp: std.hp, btu: std.btu * units };
}

export function electricalFor(btu: number, type: AcType, hours: number): Electrical {
  const eer = type === 'INVERTER' ? 13 : 9.5; // BTU/h per watt drawn, typical
  const runningW = btu / eer;
  const amps = runningW / (230 * 0.9);
  const need = amps * (type === 'INVERTER' ? 1.25 : 1.5);
  const breakerA = Math.max(16, BREAKERS.find((b) => b >= need) ?? 63);
  return { runningW, amps, breakerA, cableMm2: cableFor(breakerA), surgeW: runningW * (type === 'INVERTER' ? 1.5 : 4), kwhPerDay: (runningW * clamp(num(hours, 8), 0, 24) * 0.6) / 1000 };
}

export function analyseRoom(r: Room, ctx: Ctx): RoomResult {
  const L = Math.max(0, num(r.lengthM)), W = Math.max(0, num(r.widthM)), H = clamp(num(r.heightM, 3), 2, 8);
  const area = L * W, vol = area * H;
  const climate = CLIMATE[ctx.climate] ?? CLIMATE.INLAND;
  const dT = Math.max(0, climate.outdoorC - clamp(num(ctx.indoorC, 24), 18, 28));
  const warnings: string[] = [];
  const uWall = WALL_U[r.wallKind] ?? WALL_U.BLOCK9, glass = GLASS[r.glass] ?? GLASS.CLEAR, shade = SHADE[r.shade] ?? SHADE.NONE;

  let walls = 0, glassW = 0;
  for (const s of ['N', 'E', 'S', 'W'] as Side[]) {
    const len = Math.max(0, num(r.walls[s])), gross = len * H;
    let win = Math.max(0, num(r.windows[s]));
    if (len > 0 && win > gross) { win = gross; warnings.push(`The ${s} windows are bigger than the ${s} wall, so they were cut to fit.`); }
    walls += Math.max(0, gross - win) * uWall * (dT + SUN_EXTRA[s]);
    glassW += win * (glass.u * dT + glass.shgc * shade.f * SUN_W[s]);
  }
  const roofKind = ROOF[r.roof] ?? ROOF.ROOM_ABOVE;
  const roof = area * roofKind.u * (roofKind.u > 0 ? dT + roofKind.extra : 0);
  const people = Math.max(0, num(r.people)) * PERSON_W;
  const lighting = Math.max(0, num(r.lightingW));
  const equipment = r.equipment.reduce((s, e) => s + Math.max(0, num(e.watts)) * Math.max(0, num(e.qty, 1)), 0);
  const ach = (USE[r.use] ?? USE.BEDROOM).ach;
  const ventilation = vol * ach * climate.wPerM3h;

  const parts: Part[] = [
    { key: 'walls', label: 'Outside walls', w: walls }, { key: 'roof', label: 'Roof / ceiling', w: roof }, { key: 'glass', label: 'Windows', w: glassW },
    { key: 'people', label: 'People', w: people }, { key: 'lighting', label: 'Lighting', w: lighting }, { key: 'equipment', label: 'Equipment', w: equipment }, { key: 'ventilation', label: 'Outside air', w: ventilation },
  ];
  const subtotal = parts.reduce((s, p) => s + p.w, 0);
  const total = subtotal * (1 + SAFETY_PCT / 100);
  const btu = total * W_TO_BTU;
  const sizing = sizeFor(btu);
  const elec = electricalFor(sizing.btu, r.acType, r.hoursPerDay);
  const perUnitElec = sizing.units > 1 ? electricalFor(sizing.perUnitBtu, r.acType, r.hoursPerDay) : elec;

  let fit: RoomResult['fit'] = 'NONE', coverage: number | null = null;
  if (r.chosenBtu && btu > 0) {
    coverage = num(r.chosenBtu) / btu;
    fit = coverage < 0.85 ? 'UNDER' : coverage < 0.97 ? 'SLIGHTLY_UNDER' : coverage <= 1.35 ? 'GOOD' : 'OVER';
  }
  if (area > 0 && area < 4) warnings.push('That is a very small room. Check the length and width.');
  if (btu > 60000) warnings.push('This is a large load. A ducted or VRF system designed by an engineer is probably better than many splits.');
  if (r.roof === 'NO_CEILING') warnings.push('A metal roof with no ceiling adds a lot of heat. A ceiling with insulation will cut the load and the running cost more than a bigger AC.');
  if (r.use === 'RESTAURANT' && equipment >= 1500) warnings.push('Kitchens need extraction. Do not rely on the AC to cool a cooking area.');
  if (people > 0 && num(r.people) > area / 1.5 && area > 0) warnings.push('That is a lot of people for the floor area. Check the number.');
  return { areaM2: area, volumeM3: vol, deltaT: dT, parts, subtotalW: subtotal, totalW: total, btu, sizing, electrical: perUnitElec, fit, coverage, warnings };
}

export interface Project { rooms: Room[]; ctx: Ctx }
export function projectTotals(p: Project) {
  const rs = p.rooms.map((r) => ({ room: r, res: analyseRoom(r, p.ctx) }));
  return { rooms: rs, totalBtu: rs.reduce((s, x) => s + x.res.btu, 0), units: rs.reduce((s, x) => s + x.res.sizing.units, 0), runningW: rs.reduce((s, x) => s + x.res.electrical.runningW * x.res.sizing.units, 0), kwhPerDay: rs.reduce((s, x) => s + x.res.electrical.kwhPerDay * x.res.sizing.units, 0) };
}

export const FIT_TEXT: Record<RoomResult['fit'], string> = {
  NONE: '', UNDER: 'Too small. It will struggle on hot afternoons.', SLIGHTLY_UNDER: 'A little small. It may run flat out on the hottest days.',
  GOOD: 'A good fit.', OVER: 'Too big. It will switch on and off often, dry the air badly and cost more.',
};

export function summaryText(p: Project, who: { project: string; customer: string; by: string }): string {
  const t = projectTotals(p);
  const lines = t.rooms.map(({ room, res }) => `- ${room.name} (${round(res.areaM2, 1)} m2): needs ${round(res.btu, -2).toLocaleString('en')} BTU/h, fit ${res.sizing.units > 1 ? `${res.sizing.units} x ` : ''}${res.sizing.perUnitBtu.toLocaleString('en')} BTU (${res.sizing.hp}) ${room.acType === 'INVERTER' ? 'inverter' : 'fixed-speed'}, breaker ${res.electrical.breakerA}A, ${res.electrical.cableMm2}mm2 cable`);
  return [`Air-conditioner sizing${who.customer ? ` for ${who.customer}` : ''}${who.project ? ` (${who.project})` : ''}`, ...lines, '', `Total: ${t.units} unit(s), about ${round(t.runningW / 1000, 1)} kW running.`, '', `Prepared by ${who.by} on Estate Copilot Artisans. A sizing estimate. Confirm on site and follow the manufacturer's installation instructions and the wiring regulations.`].join('\n');
}
