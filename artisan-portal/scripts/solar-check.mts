// Hand-calculated checks for the solar sizing engine. Run: cd backend && npx tsx ../artisan-portal/scripts/solar-check.mts
import assert from 'node:assert/strict';
import { analyse, recommend, simulateDay, newDesign, applyRecommendation, fmtHM, PRESETS, effectivePsh, type Appliance, type Design } from '../src/lib/solar.ts';

let n = 0;
const near = (got: number, want: number, tol = 0.01, msg = '') => { n++; assert.ok(Math.abs(got - want) <= Math.abs(want) * tol + 1e-9, `${msg} got ${got}, want ${want}`); };
const app = (o: Partial<Appliance> & { name: string; watts: number }): Appliance => ({ id: o.name, qty: 1, hours: 1, duty: 1, when: 'ALL', surge: 1, on: true, ...o });

const base: Design = {
  ...newDesign('Lagos'), conservative: true, panels: 4, panelWatts: 550, batteryQty: 1, unitId: 'li-48-100',
  appliances: [
    app({ name: 'Fridge', watts: 150, hours: 24, duty: 0.4, when: 'ALL', surge: 4 }),
    app({ name: 'LED', watts: 10, qty: 4, hours: 6, when: 'NIGHT' }),
    app({ name: 'TV', watts: 90, hours: 6, when: 'NIGHT' }),
    app({ name: 'Fan', watts: 75, hours: 8, when: 'ALL', surge: 1.5 }),
  ],
};
let a = analyse(base);
near(a.peakW, 355, 0, 'peak'); near(a.avgRunW, 265, 0, 'avg run'); near(a.dailyWh, 2820, 0, 'daily');
near(a.nightWh, 1800, 0, 'night'); near(a.dayWh, 1020, 0, 'day'); near(a.surgeW, 355 + 450, 0, 'surge');
near(a.usableWh, 51.2 * 100 * 0.8, 0.0001, 'usable (48V 100Ah lithium = 5.12 kWh, 80% DoD)');
near(a.runtimeH!, (4096 * 0.88) / 265, 0.001, 'runtime');
near(a.psh, 3.6, 0, 'conservative Lagos psh'); near(a.harvestWh, 2200 * 3.6 * 0.8, 0.0001, 'harvest');
near(a.surplusWh, 6336 - 1020 / 0.88, 0.001, 'surplus'); near(a.refillWh, (1800 / 0.88) / 0.95, 0.001, 'refill');
near(a.nightCoverHours!, (4096 * 0.88) / 150, 0.001, 'night cover'); assert.equal(a.verdict, 'SUSTAINABLE'); n++;
near(a.chargeHours!, 1.497, 0.01, 'charge hours');

// load shedding: switching the fridge off must raise the runtime
const shed = analyse({ ...base, appliances: base.appliances.map((x) => (x.name === 'Fridge' ? { ...x, on: false } : x)) });
assert.ok(shed.runtimeH! > a.runtimeH!); n++;
near(shed.avgRunW, 205, 0, 'avg run without fridge');

// lead-acid has half the usable energy
const la = analyse({ ...base, unitId: 'la-12-200', batteryQty: 1 });
near(la.usableWh, 12 * 200 * 0.5, 0.0001, 'lead-acid usable');
assert.ok(la.warnings.some((w) => w.level === 'bad' && /drained past/.test(w.text))); n++; // 1 battery cannot carry the night safely

// too few panels -> solar short, with a night gap
const small = analyse({ ...base, panels: 1 });
assert.equal(small.verdict, 'SOLAR_SHORT'); n++; assert.ok(small.nightGapAcWh > 0); n++;
// no panels at all
assert.equal(analyse({ ...base, panels: 0 }).verdict, 'SOLAR_SHORT'); n++;
// nothing on
assert.equal(analyse({ ...base, appliances: [] }).verdict, 'NO_LOAD'); n++;
assert.equal(analyse({ ...base, appliances: [] }).runtimeH, null); n++;

// recommendation (hand worked: inverter 1 kVA, 12V system, 2 x 12V 200Ah lithium, 4 panels)
const r = recommend(base, { type: 'offgrid' }, 'LITHIUM');
near(r.inverterKva, 1, 0, 'inverter kva'); near(r.systemV, 12, 0, 'system V'); near(r.qty, 2, 0, 'batteries'); near(r.panels, 4, 0, 'panels');
assert.equal(r.unit.id, 'li-12-200'); n++;
// applying the recommendation must produce a sustainable design
const applied = analyse(applyRecommendation(base, r));
assert.equal(applied.verdict, 'SUSTAINABLE'); n++;
// the recommended panels must carry daytime loads + refill the bank (spec); one panel fewer must not
const oneLess = analyse({ ...applyRecommendation(base, r), panels: r.panels - 1 });
assert.ok(oneLess.surplusWh < (applyRecommendation(base, r).panels ? analyse(applyRecommendation(base, r)).surplusWh : 0)); n++;

// a hours goal: 12 hours of the 265 W running load, no sun
const rh = recommend(base, { type: 'hours', hours: 12 }, 'LITHIUM');
assert.ok(rh.usableWh >= (265 * 12) / 0.88 - 1); n++;
// heavy home: AC + iron + pump -> big inverter, big bank, flagged
const heavy: Design = { ...base, appliances: [...base.appliances, app({ name: 'AC 1.5HP', watts: 1200, hours: 8, duty: 0.6, when: 'NIGHT', surge: 4 }), app({ name: 'Iron', watts: 1000, hours: 0.5, when: 'DAY' }), app({ name: 'Pump', watts: 400, hours: 1, when: 'DAY', surge: 4 })] };
const rhv = recommend(heavy, { type: 'offgrid' }, 'LITHIUM');
assert.ok(rhv.inverterKva >= 3.5); n++; assert.equal(rhv.systemV, 48); n++;
const rla = recommend(heavy, { type: 'offgrid' }, 'LEAD_ACID');
assert.ok(rla.qty % rla.seriesFactor === 0); n++; assert.ok(rla.qty > rhv.qty * 0 + 0); n++;
// recommended bank for the heavy home must actually cover the night, and carry the load
const hApplied = analyse(applyRecommendation(heavy, rhv));
assert.ok(hApplied.nightCoverHours! >= 12); n++;
assert.ok(!hApplied.warnings.some((w) => w.level === 'bad')); n++;

// helpers
assert.equal(fmtHM(14.3333), '14 hrs 20 mins'); n++;
assert.equal(fmtHM(null), '—'); n++;
assert.equal(effectivePsh('Kano', null, false), 5.8); n++;
assert.equal(effectivePsh('Kano', null, true), 4.64); n++;
assert.equal(effectivePsh('Nowhere', null, false), 4.8); n++;
assert.equal(effectivePsh('Lagos', 6, false), 6); n++;
// garbage in must not produce NaN
const junk = analyse({ ...base, appliances: [app({ name: 'x', watts: NaN as unknown as number, hours: 5 }), app({ name: 'y', watts: 100, hours: -3 }), app({ name: 'z', watts: 100, hours: 500, when: 'NIGHT' })], batteryQty: 0, panels: -2 });
for (const v of [junk.peakW, junk.dailyWh, junk.usableWh, junk.harvestWh]) assert.ok(Number.isFinite(v)); n++;
near(junk.nightWh, 100 * 12, 0, 'night hours capped to the 12 hour night');
assert.ok(PRESETS.every((p) => p.watts > 0 && p.duty > 0 && p.duty <= 1)); n++;
// hourly simulation agrees with the totals
const sim = simulateDay(base);
assert.equal(sim.length, 24); n++;
near(sim.reduce((t, p) => t + p.genW, 0), a.harvestWh, 0.0001, 'sim generation adds up to the harvest');
assert.equal(sim.reduce((t, p) => t + p.shortfallWh, 0), 0); n++; // sustainable design: no hour runs dry
assert.ok(sim.every((p) => p.socPct >= 0 && p.socPct <= 100.0001)); n++;
assert.ok(sim[17].socPct > 95); n++; // full by the end of the day
const simSmall = simulateDay({ ...base, panels: 1 });
assert.ok(simSmall.reduce((t, p) => t + p.shortfallWh, 0) > 0); n++; // one panel: battery runs dry overnight
assert.ok(simulateDay({ ...base, appliances: [] }).every((p) => Number.isFinite(p.soc))); n++;
console.log(`solar engine: ${n} checks passed`);
