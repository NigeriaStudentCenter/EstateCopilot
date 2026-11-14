import { CLIMATE, EQUIPMENT_PRESETS, GLASS, ROOF, SHADE, USE, WALL_U, newCtx, newRoom, type Climate, type Ctx, type Room, type Side } from '../../lib/hvac';
import { uid } from '../tools/useProjects';

export interface HvacData { rooms: Room[]; ctx: Ctx }
export const makeHvac = (climate: Climate): HvacData => ({ rooms: [], ctx: newCtx(climate) });

const n = (x: unknown, d: number, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const SIDES: Side[] = ['N', 'E', 'S', 'W'];
const pick = <K extends string>(v: unknown, set: Record<K, unknown>, d: K): K => (typeof v === 'string' && v in set ? (v as K) : d);

// Whatever is in storage is untrusted (an old version, hand-edited): rebuild every field from the defaults.
export function cleanHvac(raw: unknown, fallback: Climate): HvacData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = (r.ctx && typeof r.ctx === 'object' ? r.ctx : {}) as Record<string, unknown>;
  const ctx: Ctx = { climate: pick<Climate>(c.climate, CLIMATE, fallback), indoorC: n(c.indoorC, 24, 18, 28) };
  const rooms: Room[] = (Array.isArray(r.rooms) ? r.rooms.slice(0, 40) : []).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const d = newRoom(typeof o.id === 'string' ? o.id.slice(0, 20) : uid(), typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 40) : 'Room');
    const walls = (o.walls && typeof o.walls === 'object' ? o.walls : {}) as Record<string, unknown>, wins = (o.windows && typeof o.windows === 'object' ? o.windows : {}) as Record<string, unknown>;
    const eq = (Array.isArray(o.equipment) ? o.equipment.slice(0, 20) : []).flatMap((e) => {
      const q = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
      return typeof q.name === 'string' ? [{ name: q.name.slice(0, 40), watts: n(q.watts, 0, 0, 20000), qty: Math.round(n(q.qty, 1, 1, 99)) }] : [];
    });
    return {
      ...d,
      lengthM: n(o.lengthM, d.lengthM, 0, 100), widthM: n(o.widthM, d.widthM, 0, 100), heightM: n(o.heightM, d.heightM, 2, 8),
      roof: pick(o.roof, ROOF, d.roof), wallKind: pick(o.wallKind, WALL_U, d.wallKind), glass: pick(o.glass, GLASS, d.glass), shade: pick(o.shade, SHADE, d.shade), use: pick(o.use, USE, d.use),
      walls: Object.fromEntries(SIDES.map((s) => [s, n(walls[s], d.walls[s], 0, 100)])) as Room['walls'], windows: Object.fromEntries(SIDES.map((s) => [s, n(wins[s], d.windows[s], 0, 200)])) as Room['windows'],
      people: Math.round(n(o.people, d.people, 0, 500)), lightingW: n(o.lightingW, d.lightingW, 0, 20000), equipment: eq,
      acType: o.acType === 'FIXED' ? 'FIXED' : 'INVERTER', hoursPerDay: n(o.hoursPerDay, 8, 0, 24), chosenBtu: typeof o.chosenBtu === 'number' && o.chosenBtu >= 3000 && o.chosenBtu <= 200000 ? o.chosenBtu : null,
    };
  });
  return { rooms, ctx };
}
export const PRESET_NAMES = new Set(EQUIPMENT_PRESETS.map((p) => p.name));
