// Hand-calculated checks for the building materials estimator. Run: cd backend && npx tsx ../artisan-portal/scripts/building-check.mts
import assert from 'node:assert/strict';
import { newJob, tileResult, blockResult, plasterResult, screedResult, concreteResult, roofResult, jobLines, totals, buyQty, mix, BAG_M3, summaryText, costOf, type Job, type TileJob, type BlockJob, type RoofJob } from '../src/lib/building.ts';
let n = 0;
const near = (got: number, want: number, tol = 0.005, msg = '') => { n++; assert.ok(Math.abs(got - want) <= Math.abs(want) * tol + 1e-9, `${msg} got ${got}, want ${want}`); };
const job = <T extends Job>(kind: T['kind'], o: Partial<T> = {}): T => ({ ...newJob(kind, 'x'), ...o }) as T;

// concrete mix sanity: 1 m3 of 1:2:4 needs about 6.3 bags, 0.44 m3 sand, 0.88 m3 granite
const m = mix(1, [1, 2, 4], 1.54);
near(m.bags, 6.34, 0.005, '1:2:4 bags per m3'); near(m.sandM3, 0.44, 0.005, 'sand'); near(m.graniteM3, 0.88, 0.005, 'granite');
near(BAG_M3, 0.03472, 0.001, 'a 50kg bag of cement is 0.0347 m3');

// tiling: 4 x 3 m floor, 60x60 porcelain, 10% waste
const t = tileResult(job<TileJob>('tiles'));
near(t.area, 12, 0, 'area'); near(t.pieces, 37, 0, 'tiles (12 x 1.1 / 0.36 = 36.67 -> 37)'); near(t.cartons, 9.25, 0.0001, 'cartons exact');
near(t.bags, 3.3, 0.001, 'adhesive bags (12 / 4 m2 per bag x 1.1)'); near(t.groutKg, 1.9008, 0.001, 'grout kg'); near(t.spacers, 44.4, 0.001, 'spacers');
let l = jobLines(job<TileJob>('tiles'))[0]; assert.equal(buyQty(l), 10); n++; // 9.25 cartons -> buy 10
// diagonal pattern waste, deducting a bath/plinth, skirting
const t2 = tileResult(job<TileJob>('tiles', { deductM2: 2, wastePct: 15, tileWmm: 400, tileLmm: 400, perCarton: 6, skirtingM: 14 }));
near(t2.area, 10, 0, 'deduct'); near(t2.pieces, Math.ceil((10 * 1.15) / 0.16), 0, '40x40 diagonal'); near(t2.skirtingPieces, Math.ceil(14 * 1.05 / 0.6), 0, 'skirting pieces');
near(t2.bags, (10 / 5) * 1.1, 0.001, '40x40 adhesive coverage 5 m2/bag');
assert.ok(jobLines(job<TileJob>('tiles', { skirtingM: 0 })).every((x) => x.key !== 'tile-skirting|pcs')); n++;
near(tileResult(job<TileJob>('tiles', { lengthM: 0 })).pieces, 0, 0, 'zero area');

// blockwork: 10 m x 3 m of 9 inch wall
const b = blockResult(job<BlockJob>('blocks'));
near(b.perM2, 9.2507, 0.0005, 'blocks per m2 with 10mm joints'); near(b.blocks, 292, 0, '30 m2 x 9.25 x 1.05 = 291.4 -> 292');
near(b.mortarWet, 0.4703, 0.003, 'wet mortar'); near(b.bags, 2.515, 0.005, 'cement bags 1:6'); near(b.sandM3, 0.524, 0.005, 'sand');
const b2 = blockResult(job<BlockJob>('blocks', { openingsM2: 6 }));
near(b2.net, 24, 0, 'openings deducted'); assert.ok(b2.blocks < b.blocks); n++;
const b6 = blockResult(job<BlockJob>('blocks', { thicknessMm: 150 }));
assert.ok(b6.bags < b.bags && b6.blocks === b.blocks); n++; // thinner wall: same blocks per m2, less mortar
near(blockResult(job<BlockJob>('blocks', { openingsM2: 999 })).blocks, 0, 0, 'openings larger than the wall never give negative blocks');

// plaster, screed, concrete
const p = plasterResult(job('plaster')); near(p.wet, 0.396, 0.001, 'plaster wet'); near(p.bags, 2.965, 0.005, 'plaster bags'); near(p.sandM3, 0.4118, 0.005, 'plaster sand');
const s = screedResult(job('screed')); near(s.wet, 0.88, 0.001, 'screed wet'); near(s.bags, 6.589, 0.005, 'screed bags'); near(s.sandM3, 0.9152, 0.005, 'screed sand');
const c = concreteResult(job('concrete')); near(c.wet, 1.26, 0.001, 'concrete wet'); near(c.bags, 7.98, 0.005, 'concrete bags'); near(c.graniteM3, 1.1088, 0.005, 'granite');
assert.ok(concreteResult(job('concrete', { mix: '1:1.5:3' })).bags > c.bags); n++; // richer mix, more cement

// roof: gable 10 x 8 m, 0.4 m overhang, 15 degrees, long-span 0.85 m cover
const r = roofResult(job<RoofJob>('roof'));
near(r.areaM2, 98.39, 0.002, 'roof area = plan / cos'); near(r.slopeM, 4.5551, 0.002, 'sheet length'); near(r.columns, 13, 0, 'sheets across'); near(r.sheets, 26, 0, 'sheets');
near(r.runningM, 124.35, 0.003, 'running metres incl 5% waste'); near(r.ridgePieces, 6, 0, 'ridge pieces'); near(r.screws, 650, 0.005, 'screws'); near(r.gutterPieces, 7, 0, 'gutter'); near(r.downpipes, 2, 0, 'downpipes');
// a long slope is split with an end lap
const rl = roofResult(job<RoofJob>('roof', { widthM: 30, maxSheetM: 12 })); assert.ok(rl.segments >= 2 && rl.sheets === rl.columns * 2 * rl.segments); n++;
// hip: area from plan, ridge + 4 hips
const rh = roofResult(job<RoofJob>('roof', { roofType: 'hip' })); near(rh.areaM2, 98.39, 0.002, 'hip area'); near(rh.ridgeM, 2 + 4 * 6.333, 0.003, 'hip ridge + hips');
assert.ok(rh.warnings.some((w) => /Hip roofs/.test(w))); n++;
// mono-pitch
const rm = roofResult(job<RoofJob>('roof', { roofType: 'mono', widthM: 4 })); near(rm.slopeM, (4 + 0.4) / Math.cos(15 * Math.PI / 180), 0.002, 'mono slope'); near(rm.planes, 1, 0, 'one plane'); near(rm.gutterM, 10, 0, 'one gutter');
// stone-coated counted by area
const rs = roofResult(job<RoofJob>('roof', { covering: 'stone' })); near(rs.stonePieces, Math.ceil(98.39 * 2.7 * 1.05), 0.002, 'stone tiles');
// warnings
assert.ok(roofResult(job<RoofJob>('roof', { pitchDeg: 3 })).warnings.some((w) => /Under 5 degrees/.test(w))); n++;
assert.ok(roofResult(job<RoofJob>('roof', { covering: 'stone', pitchDeg: 10 })).warnings.some((w) => /15 degrees/.test(w))); n++;
assert.ok(roofResult(job<RoofJob>('roof', { overhangM: 0.9 })).warnings.some((w) => /overhang/.test(w))); n++;
assert.ok(rs.warnings.some((w) => /purlin/i.test(w))); n++;
assert.ok(!jobLines(job<RoofJob>('roof', { gutter: false })).some((x) => x.key === 'gutter|length')); n++;

// totals: cement from every job is added BEFORE rounding
const jobs: Job[] = [job('blocks'), job('plaster'), job('screed'), job('concrete')];
const tot = totals(jobs); const cem = tot.find((x) => x.key === 'cement|bag')!;
near(cem.exact, 2.515 + 2.965 + 6.589 + 7.98, 0.003, 'cement exact over four jobs'); assert.equal(cem.qty, Math.ceil(cem.exact)); n++;
assert.ok(cem.qty <= 3 + 3 + 7 + 8); n++; // never more than buying each job separately
assert.ok(tot.find((x) => x.key === 'plaster-sand|m3') && tot.find((x) => x.key === 'sharp-sand|m3') && tot.find((x) => x.key === 'granite|m3'), 'soft sand for blockwork/plaster, sharp sand for screed/concrete'); n++;
assert.equal(tot[0].key.startsWith('block'), true); n++; // blocks first
// two tiling jobs of the same size are added; different sizes stay separate
const t60 = totals([job<TileJob>('tiles'), job<TileJob>('tiles')]).find((x) => x.key.startsWith('tile|'))!; near(t60.exact, 18.5, 0.001, 'two 12 m2 rooms: 18.5 cartons'); assert.equal(t60.qty, 19); n++;
assert.equal(totals([job<TileJob>('tiles'), job<TileJob>('tiles', { tileWmm: 400, tileLmm: 400, perCarton: 6 })]).filter((x) => x.key.startsWith('tile|')).length, 2); n++;
assert.equal(buyQty({ exact: 0.31, unit: 'm3' }), 0.4); n++; assert.equal(buyQty({ exact: 124.35, unit: 'm' }), 124.5); n++; assert.equal(buyQty({ exact: 0, unit: 'bag' }), 0); n++;
// garbage in, no NaN
const junk = totals([job<TileJob>('tiles', { lengthM: NaN as unknown as number, tileWmm: 0 }), job<BlockJob>('blocks', { heightM: -3 }), job<RoofJob>('roof', { widthM: NaN as unknown as number, pitchDeg: 999 })]);
assert.ok(junk.every((x) => Number.isFinite(x.exact) && Number.isFinite(x.qty))); n++;
// money and summary text
const prices = { 'cement|bag': 9500, 'block|9 inch|pcs': 450 };
const txt = summaryText([job('blocks')], prices, { project: 'Boundary wall', customer: 'Mrs Ade', by: 'Tunde' });
assert.ok(/Materials list for Mrs Ade \(Boundary wall\)/.test(txt) && /Sandcrete blocks \(9 inch\): 292 pcs = N131,400/.test(txt) && /Cement \(50kg bag\): 3 bags = N28,500/.test(txt) && /Estimated materials cost: N159,900/.test(txt)); n++;
near(costOf({ ...cem, qty: 21 }, { 'cement|bag': 9000 }), 189000, 0, 'cost');
console.log(`building estimator: ${n} checks passed`);
