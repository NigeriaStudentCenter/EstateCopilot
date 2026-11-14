// Hand-calculated checks for the air-conditioner sizing engine. Run: cd backend && npx tsx ../artisan-portal/scripts/hvac-check.mts
import assert from 'node:assert/strict';
import { analyseRoom, newRoom, newCtx, sizeFor, electricalFor, climateFor, projectTotals, summaryText, hpLabel, CLIMATE, type Room, type Project } from '../src/lib/hvac.ts';
let n = 0;
const near = (got: number, want: number, tol = 0.005, msg = '') => { n++; assert.ok(Math.abs(got - want) <= Math.abs(want) * tol + 1e-9, `${msg} got ${got}, want ${want}`); };
const part = (r: ReturnType<typeof analyseRoom>, k: string) => r.parts.find((p) => p.key === k)!.w;
const room = (o: Partial<Room> = {}): Room => ({ ...newRoom('r'), heightM: 2.7, walls: { N: 4, E: 0, S: 0, W: 4 }, windows: { N: 0, E: 0, S: 0, W: 1.5 }, roof: 'SLAB', people: 2, lightingW: 96, equipment: [{ name: 'TV', watts: 100, qty: 1 }], ...o });
const coastal = newCtx('COASTAL'); // outdoor 33, indoor 24 -> dT 9

// hand-worked 4 x 4 m bedroom, top floor under a concrete slab, Lagos
const r = analyseRoom(room(), coastal);
near(r.deltaT, 9, 0, 'dT'); near(r.areaM2, 16, 0, 'area'); near(r.volumeM3, 43.2, 0, 'volume');
near(part(r, 'walls'), 9.3 * 2.3 * 17 + 10.8 * 2.3 * 11, 0.0001, 'walls: W wall (9.3 m2, dT+8) + N wall (10.8 m2, dT+2)');
near(part(r, 'roof'), 16 * 2.4 * (9 + 15), 0.0001, 'slab roof'); near(part(r, 'glass'), 1.5 * (5.8 * 9 + 0.8 * 0.7 * 550), 0.0001, 'west window with curtains');
near(part(r, 'people'), 260, 0, 'people'); near(part(r, 'lighting'), 96, 0, 'lighting'); near(part(r, 'equipment'), 100, 0, 'TV');
near(part(r, 'ventilation'), 43.2 * 0.4 * 16, 0.0001, 'fresh air');
near(r.subtotalW, 2831.25, 0.0005, 'subtotal W'); near(r.totalW, 3114.375, 0.0005, 'total W with 10%'); near(r.btu, 10626, 0.001, 'BTU/h');
assert.equal(r.sizing.perUnitBtu, 12000); n++; assert.equal(r.sizing.hp, '1.5 HP'); n++; assert.equal(r.sizing.units, 1); n++;
// electrical for the 12,000 BTU inverter fitted
near(r.electrical.runningW, 12000 / 13, 0.0001, 'inverter running W'); near(r.electrical.amps, 12000 / 13 / (230 * 0.9), 0.0001, 'amps'); assert.equal(r.electrical.breakerA, 16); n++; assert.equal(r.electrical.cableMm2, 2.5); n++;
near(r.electrical.kwhPerDay, (12000 / 13) * 8 * 0.6 / 1000, 0.0001, 'kWh per day');
near(electricalFor(12000, 'FIXED', 8).runningW, 12000 / 9.5, 0.0001, 'fixed-speed draws more'); near(electricalFor(12000, 'FIXED', 8).surgeW, (12000 / 9.5) * 4, 0.0001, 'fixed surge x4'); near(electricalFor(12000, 'INVERTER', 8).surgeW, (12000 / 13) * 1.5, 0.0001, 'inverter surge x1.5');

// the same room with another room above it is much smaller, and a metal roof with no ceiling much bigger
const noRoof = analyseRoom(room({ roof: 'ROOM_ABOVE' }), coastal); near(part(noRoof, 'roof'), 0, 0, 'no roof load'); assert.ok(noRoof.btu < r.btu * 0.75); n++;
assert.equal(noRoof.sizing.perUnitBtu, 9000); n++; // 16 m2 bedroom with a room above: 1 HP
const bare = analyseRoom(room({ roof: 'NO_CEILING' }), coastal); assert.ok(bare.btu > r.btu); n++; assert.ok(bare.warnings.some((w) => /no ceiling/i.test(w))); n++;
assert.ok(analyseRoom(room({ roof: 'CEILING_INSULATED' }), coastal).btu < analyseRoom(room({ roof: 'CEILING_VENTED' }), coastal).btu); n++;
// glass and shade
const tinted = analyseRoom(room({ glass: 'TINTED', shade: 'OVERHANG' }), coastal); assert.ok(part(tinted, 'glass') < part(r, 'glass') * 0.7); near(part(tinted, 'glass'), 1.5 * (5.8 * 9 + 0.55 * 0.5 * 550), 0.0001, 'tinted + overhang'); n++;
const sunSide = (s: 'N' | 'E' | 'S' | 'W') => part(analyseRoom(room({ walls: { N: 4, E: 4, S: 4, W: 4 }, windows: { N: 0, E: 0, S: 0, W: 0, [s]: 2 } }), coastal), 'glass');
assert.ok(sunSide('W') > sunSide('E') && sunSide('E') > sunSide('S') && sunSide('S') > sunSide('N')); n++; // west is the worst, north the mildest
// climate: the hot dry north has the biggest outdoor temperature gap, the coast the most humid fresh air
const north = analyseRoom(room(), newCtx('NORTH')), inland = analyseRoom(room(), newCtx('INLAND'));
near(north.deltaT, 14, 0, 'north dT'); assert.ok(north.btu > inland.btu); n++; assert.ok(part(r, 'ventilation') / (43.2 * 0.4) > part(north, 'ventilation') / (43.2 * 0.4)); n++;
assert.equal(climateFor('Lagos State'), 'COASTAL'); n++; assert.equal(climateFor('Kano'), 'NORTH'); n++; assert.equal(climateFor('FCT (Abuja)'), 'INLAND'); n++; assert.equal(climateFor(''), 'INLAND'); n++;
// a cooler setpoint costs more
near(analyseRoom(room(), { ...coastal, indoorC: 22 }).deltaT, 11, 0, 'cooler setpoint'); assert.ok(analyseRoom(room(), { ...coastal, indoorC: 22 }).btu > r.btu); n++;
// windows larger than the wall are cut to the wall
const big = analyseRoom(room({ windows: { N: 0, E: 0, S: 0, W: 50 } }), coastal); assert.ok(big.warnings.some((w) => /bigger than the W wall/.test(w))); n++;
near(part(big, 'glass'), 4 * 2.7 * (5.8 * 9 + 0.8 * 0.7 * 550), 0.0001, 'window area capped at the wall area');
// a shop: more fresh air; a restaurant kitchen warns
assert.ok(part(analyseRoom(room({ use: 'SHOP' }), coastal), 'ventilation') > part(r, 'ventilation') * 2.5); n++;
assert.ok(analyseRoom(room({ use: 'RESTAURANT', equipment: [{ name: 'Cooking', watts: 1500, qty: 1 }] }), coastal).warnings.some((w) => /extraction/.test(w))); n++;

// standard sizes
assert.equal(sizeFor(6000).perUnitBtu, 9000); n++; // nothing smaller than 1 HP is sold assert.equal(sizeFor(9000).perUnitBtu, 9000); n++; assert.equal(sizeFor(9100).perUnitBtu, 9000); n++; // within 3% rounds down
assert.equal(sizeFor(9400).perUnitBtu, 12000); n++; assert.equal(sizeFor(17000).perUnitBtu, 18000); n++; assert.equal(sizeFor(36000).perUnitBtu, 36000); n++;
const two = sizeFor(50000); assert.equal(two.units, 2); n++; assert.equal(two.perUnitBtu, 30000); n++; assert.equal(two.btu, 60000); n++; // 2 x 25,000 -> 2 x 30,000
assert.equal(sizeFor(0).units, 0); n++; assert.equal(hpLabel(18000), '2 HP'); n++;
// comparing a chosen size
const c = (b: number) => analyseRoom(room({ chosenBtu: b }), coastal).fit;
assert.equal(c(7000), 'UNDER'); n++; assert.equal(c(9000), 'UNDER'); n++; assert.equal(c(12000), 'GOOD'); n++; assert.equal(c(18000), 'OVER'); n++; assert.equal(analyseRoom(room(), coastal).fit, 'NONE'); n++;
near(analyseRoom(room({ chosenBtu: 9000 }), coastal).coverage!, 9000 / r.btu, 0.0001, 'coverage');
// breaker and cable steps
assert.equal(electricalFor(24000, 'FIXED', 8).breakerA, 20); n++; assert.equal(electricalFor(24000, 'FIXED', 8).cableMm2, 2.5); n++; assert.equal(electricalFor(36000, 'FIXED', 8).breakerA, 32); n++; assert.equal(electricalFor(36000, 'FIXED', 8).cableMm2, 6); n++; assert.equal(electricalFor(9000, 'INVERTER', 8).breakerA, 16); n++;
// project totals and summary text
const p: Project = { ctx: coastal, rooms: [room({ name: 'Master bedroom' }), room({ name: 'Guest room', roof: 'ROOM_ABOVE' })] };
const t = projectTotals(p); near(t.units, 2, 0, 'units'); near(t.totalBtu, r.btu + noRoof.btu, 0.0001, 'total BTU'); near(t.runningW, 12000 / 13 + 9000 / 13, 0.0001, 'running W');
const txt = summaryText(p, { project: '2 bed flat', customer: 'Mr Okoye', by: 'Emeka' });
assert.ok(/Air-conditioner sizing for Mr Okoye \(2 bed flat\)/.test(txt) && /Master bedroom \(16 m2\): needs 10,600 BTU\/h, fit 12,000 BTU \(1.5 HP\) inverter, breaker 16A, 2.5mm2 cable/.test(txt) && /Guest room.*9,000 BTU \(1 HP\)/.test(txt)); n++;
// garbage in, no NaN
const junk = analyseRoom(room({ lengthM: NaN as unknown as number, heightM: -5, people: NaN as unknown as number, walls: { N: -3, E: NaN as unknown as number, S: 0, W: 0 } }), coastal);
assert.ok([junk.btu, junk.totalW, junk.electrical.amps].every(Number.isFinite)); n++;
assert.ok(Object.keys(CLIMATE).length === 3); n++;
console.log(`hvac sizing: ${n} checks passed`);
