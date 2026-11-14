import { newDesign, BATTERY_UNITS, type Appliance, type Design, type When } from '../../lib/solar';

// Saved designs live on the phone only (localStorage). Everything is optional: if storage is blocked the tool still works for the session.
export interface Project { id: string; name: string; customer: string; updatedAt: number; design: Design }
const key = (artisanId: string) => `ec_solar_v1_${artisanId}`;
export const uid = () => Math.random().toString(36).slice(2, 10);

const n = (x: unknown, d: number, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const WHEN = new Set<string>(['DAY', 'NIGHT', 'ALL']);

// Whatever is in storage is untrusted (old version, hand-edited): rebuild every field with a safe default.
export function cleanDesign(raw: unknown, region: string): Design {
  const base = newDesign(region);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const apps = Array.isArray(r.appliances) ? r.appliances.slice(0, 60) : [];
  const appliances: Appliance[] = apps.flatMap((x): Appliance[] => {
    const a = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const name = typeof a.name === 'string' ? a.name.slice(0, 40) : '';
    if (!name) return [];
    return [{ id: typeof a.id === 'string' ? a.id.slice(0, 20) : uid(), name, qty: n(a.qty, 1, 1, 99), watts: n(a.watts, 0, 0, 20000), hours: n(a.hours, 1, 0, 24), duty: n(a.duty, 1, 0.05, 1), when: WHEN.has(String(a.when)) ? (a.when as When) : 'ALL', surge: n(a.surge, 1, 1, 10), on: a.on !== false }];
  });
  const cu = (r.custom && typeof r.custom === 'object' ? r.custom : {}) as Record<string, unknown>;
  const unitId = typeof r.unitId === 'string' && (r.unitId === 'custom' || BATTERY_UNITS.some((u) => u.id === r.unitId)) ? r.unitId : base.unitId;
  return {
    appliances, unitId,
    custom: { volts: n(cu.volts, 48, 1, 100), ah: n(cu.ah, 100, 1, 2000), chem: cu.chem === 'LEAD_ACID' ? 'LEAD_ACID' : 'LITHIUM' },
    batteryQty: Math.round(n(r.batteryQty, 1, 1, 40)), panelWatts: n(r.panelWatts, 550, 100, 800), panels: Math.round(n(r.panels, 4, 0, 200)),
    region: typeof r.region === 'string' ? r.region.slice(0, 40) : region, pshOverride: r.pshOverride === null || r.pshOverride === undefined ? null : n(r.pshOverride, 4.8, 1, 8),
    conservative: r.conservative !== false, invEff: n(r.invEff, 0.88, 0.7, 0.98),
  };
}

export function loadProjects(artisanId: string, region: string): Project[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(artisanId)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 30).map((p: Record<string, unknown>) => ({
      id: typeof p.id === 'string' ? p.id : uid(), name: typeof p.name === 'string' ? p.name.slice(0, 60) : 'Design', customer: typeof p.customer === 'string' ? p.customer.slice(0, 60) : '',
      updatedAt: n(p.updatedAt, Date.now(), 0, 4e12), design: cleanDesign(p.design, region),
    }));
  } catch { return []; }
}
export function saveProjects(artisanId: string, projects: Project[]) {
  try { localStorage.setItem(key(artisanId), JSON.stringify(projects.slice(0, 30))); } catch { /* storage blocked: still works for this session */ }
}
export const newProject = (region: string, name = 'New design'): Project => ({ id: uid(), name, customer: '', updatedAt: Date.now(), design: newDesign(region) });

// Add the air conditioners sized in the AC tool to a saved solar design, as ordinary appliances. An AC added before under the same
// name is replaced, so sending the list again after an edit does not double it. Returns the design's name, or null if it was not found.
export interface AcLoad { name: string; units: number; runningW: number; hours: number; acType: 'FIXED' | 'INVERTER'; use: 'BEDROOM' | 'LIVING' | 'OFFICE' | 'SHOP' | 'RESTAURANT' }
export function addAcsToSolar(artisanId: string, region: string, projectId: string | null, loads: AcLoad[]): string | null {
  const projects = loadProjects(artisanId, region);
  const target = projects.find((p) => p.id === projectId) ?? projects[0];
  if (!target) return null;
  const names = new Set(loads.map((l) => `AC - ${l.name}`.slice(0, 40)));
  const added: Appliance[] = loads.filter((l) => l.runningW > 0).map((l) => {
    const hours = Math.min(24, Math.max(0.5, l.hours || 8));
    const when: When = hours > 12 ? 'ALL' : l.use === 'BEDROOM' ? 'NIGHT' : l.use === 'OFFICE' || l.use === 'SHOP' ? 'DAY' : 'ALL';
    return { id: uid(), name: `AC - ${l.name}`.slice(0, 40), qty: Math.max(1, Math.round(l.units)), watts: Math.round(l.runningW), hours, duty: 0.6, when, surge: l.acType === 'FIXED' ? 4 : 1.5, on: true };
  });
  target.design = { ...target.design, appliances: [...target.design.appliances.filter((a) => !names.has(a.name)), ...added].slice(0, 60) };
  target.updatedAt = Date.now();
  saveProjects(artisanId, projects);
  return target.name;
}
export const solarProjectNames = (artisanId: string, region: string) => loadProjects(artisanId, region).map((p) => ({ id: p.id, name: p.customer ? `${p.customer} · ${p.name}` : p.name }));
