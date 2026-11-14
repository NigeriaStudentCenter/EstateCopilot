// Checks the AC -> solar hand-off against a fake localStorage. Run: cd backend && npx tsx ../artisan-portal/scripts/ac-solar-check.mts
import assert from 'node:assert/strict';
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
const { addAcsToSolar, loadProjects, saveProjects, newProject, solarProjectNames } = await import('../src/pages/solar/store.ts');
const { analyse } = await import('../src/lib/solar.ts');
let n = 0;
const loads = [{ name: 'Master bedroom', units: 1, runningW: 923, hours: 8, acType: 'INVERTER' as const, use: 'BEDROOM' as const }, { name: 'Shop', units: 2, runningW: 1263, hours: 10, acType: 'FIXED' as const, use: 'SHOP' as const }];
// no saved design yet: creates one
let name = addAcsToSolar('u1', 'Lagos', null, loads); assert.ok(name === null || typeof name === 'string'); n++;
const first = loadProjects('u1', 'Lagos'); saveProjects('u1', first.length ? first : [newProject('Lagos', 'Flat 3')]);
name = addAcsToSolar('u1', 'Lagos', null, loads); assert.ok(name); n++;
let d = loadProjects('u1', 'Lagos')[0].design;
const bed = d.appliances.find((a) => a.name === 'AC - Master bedroom')!, shop = d.appliances.find((a) => a.name === 'AC - Shop')!;
assert.deepEqual([bed.qty, bed.watts, bed.hours, bed.when, bed.duty, bed.surge, bed.on], [1, 923, 8, 'NIGHT', 0.6, 1.5, true]); n++;
assert.deepEqual([shop.qty, shop.watts, shop.hours, shop.when, shop.surge], [2, 1263, 10, 'DAY', 4]); n++;
// adding again replaces, never doubles
addAcsToSolar('u1', 'Lagos', null, loads); d = loadProjects('u1', 'Lagos')[0].design; assert.equal(d.appliances.filter((a) => a.name.startsWith('AC - ')).length, 2); n++;
// the solar engine sees the load: daily Wh = 923 x 8 x 0.6 + 2 x 1263 x 10 x 0.6
const a = analyse(d); assert.ok(Math.abs(a.dailyWh - (923 * 8 * 0.6 + 2 * 1263 * 10 * 0.6)) < 1); n++;
assert.ok(Math.abs(a.peakW - (923 + 2 * 1263)) < 1 && a.surgeW > a.peakW); n++;
// other appliances are kept, a missing design id falls back to the first, zero-watt loads are ignored
const p = loadProjects('u1', 'Lagos'); p[0].design.appliances.push({ id: 'x', name: 'Fridge', qty: 1, watts: 150, hours: 24, duty: 0.4, when: 'ALL', surge: 4, on: true }); saveProjects('u1', p);
addAcsToSolar('u1', 'Lagos', 'no-such-id', [{ ...loads[0], name: 'Guest', runningW: 0 }]); d = loadProjects('u1', 'Lagos')[0].design; assert.ok(d.appliances.some((x) => x.name === 'Fridge') && !d.appliances.some((x) => x.name === 'AC - Guest')); n++;
assert.equal(solarProjectNames('u1', 'Lagos').length, 1); n++;
console.log(`ac to solar: ${n} checks passed`);
