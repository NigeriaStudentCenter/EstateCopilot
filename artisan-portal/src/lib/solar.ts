// Solar & battery sizing engine. Pure functions, no React, no network: the app calls these on every slider move, and the
// tests (artisan-portal/scripts/solar-check.mts) call them directly.
//
// Formulas follow the product spec:
//   daily Wh            = sum(W x qty x hours x duty cycle)
//   usable battery Wh   = V x Ah x qty x depth of discharge (0.80 lithium, 0.50 lead-acid)
//   runtime (h)         = usable Wh x inverter efficiency / running load W
//   daily solar harvest = panel W x panels x peak sun hours x 0.80 (heat, dust, wiring, MPPT losses)
//   charge time (h)     = Wh needed to refill the battery / (array output - daytime load)
// Everything here is an estimate for choosing equipment. The installer's site survey and the manufacturers' datasheets win.

export type Chem = 'LITHIUM' | 'LEAD_ACID';
export type When = 'DAY' | 'NIGHT' | 'ALL';

export interface Appliance {
  id: string;
  name: string;
  qty: number;
  watts: number; // rating plate watts for ONE unit
  hours: number; // planned hours of use in a 24h cycle
  duty: number; // 0..1 share of the time it really draws full power (fridge compressor ~0.4)
  when: When; // DAY = 06:00-18:00, NIGHT = 18:00-06:00, ALL = spread evenly over the day
  surge: number; // motor start-up multiple (fridge/AC/pump ~3-6), 1 for lights and electronics
  on: boolean; // the load-shedding switch
}

// volts = the system class (12/24/48). nominalV = what the cells really are (LiFePO4 packs are 12.8/25.6/51.2V), used for energy.
export interface BatteryUnit { id: string; label: string; volts: number; ah: number; chem: Chem; nominalV?: number }
export const unitWh = (u: BatteryUnit) => (u.nominalV ?? u.volts) * u.ah;

export const DOD: Record<Chem, number> = { LITHIUM: 0.8, LEAD_ACID: 0.5 };
export const ROUND_TRIP: Record<Chem, number> = { LITHIUM: 0.95, LEAD_ACID: 0.85 };
// Continuous discharge a battery bank can take, as a fraction of its Ah (C-rate). Lead-acid hates heavy loads.
export const MAX_C: Record<Chem, number> = { LITHIUM: 0.5, LEAD_ACID: 0.2 };
export const SOLAR_DERATE = 0.8;
export const DAY_HOURS = 12;
export const INVERTER_PF = 0.8; // kVA x 0.8 = kW on the inverters sold here
export const INVERTER_SIZES_KVA = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7.5, 8, 10, 12, 15, 20];

export const BATTERY_UNITS: BatteryUnit[] = [
  { id: 'li-48-100', label: '48V 100Ah lithium (5.12 kWh)', volts: 48, nominalV: 51.2, ah: 100, chem: 'LITHIUM' },
  { id: 'li-48-200', label: '48V 200Ah lithium (10.24 kWh)', volts: 48, nominalV: 51.2, ah: 200, chem: 'LITHIUM' },
  { id: 'li-24-100', label: '24V 100Ah lithium (2.56 kWh)', volts: 24, nominalV: 25.6, ah: 100, chem: 'LITHIUM' },
  { id: 'li-24-200', label: '24V 200Ah lithium (5.12 kWh)', volts: 24, nominalV: 25.6, ah: 200, chem: 'LITHIUM' },
  { id: 'li-12-200', label: '12V 200Ah lithium (2.56 kWh)', volts: 12, nominalV: 12.8, ah: 200, chem: 'LITHIUM' },
  { id: 'la-12-200', label: '12V 200Ah tubular lead-acid (2.4 kWh)', volts: 12, ah: 200, chem: 'LEAD_ACID' },
  { id: 'la-12-150', label: '12V 150Ah tubular lead-acid (1.8 kWh)', volts: 12, ah: 150, chem: 'LEAD_ACID' },
  { id: 'la-12-100', label: '12V 100Ah lead-acid (1.2 kWh)', volts: 12, ah: 100, chem: 'LEAD_ACID' },
];
export const PANEL_WATTS = [330, 400, 450, 500, 550, 600];
export const unitById = (id: string) => BATTERY_UNITS.find((u) => u.id === id);

// Typical annual-average peak sun hours (kWh/m2/day). Approximate, rounded: the north of Nigeria is sunnier than the coast.
// "Conservative" below takes 20% off for the rainy season / harmattan haze, which is what off-grid systems should be sized for.
export const PSH: Record<string, number> = {
  Sokoto: 6.0, Kebbi: 5.9, Zamfara: 5.9, Katsina: 5.9, Kano: 5.8, Jigawa: 5.9, Yobe: 5.9, Borno: 6.0, Bauchi: 5.7, Gombe: 5.7, Adamawa: 5.6, Taraba: 5.3,
  Kaduna: 5.6, Niger: 5.4, Kwara: 5.2, Kogi: 5.0, Benue: 5.1, Nasarawa: 5.2, Plateau: 5.3, 'FCT (Abuja)': 5.2,
  Oyo: 5.0, Osun: 4.8, Ogun: 4.7, Ondo: 4.5, Ekiti: 4.7, Lagos: 4.5,
  Edo: 4.5, Delta: 4.3, Bayelsa: 4.0, Rivers: 4.2, 'Akwa Ibom': 4.1, 'Cross River': 4.2,
  Enugu: 4.9, Ebonyi: 4.8, Anambra: 4.6, Imo: 4.5, Abia: 4.4,
  'United Kingdom': 2.6,
};
export const REGIONS = Object.keys(PSH);
export const effectivePsh = (region: string, base: number | null, conservative: boolean) => {
  const v = base ?? PSH[region] ?? 4.8;
  return Math.round(v * (conservative ? 0.8 : 1) * 100) / 100;
};

// ---- appliance presets (Nigerian-typical ratings; the rating plate or a scan overrides them) ---------------------------
export interface Preset { name: string; watts: number; hours: number; duty: number; when: When; surge: number }
export const PRESETS: Preset[] = [
  { name: 'LED bulb', watts: 10, hours: 6, duty: 1, when: 'NIGHT', surge: 1 },
  { name: 'Ceiling fan', watts: 75, hours: 8, duty: 1, when: 'ALL', surge: 1.5 },
  { name: 'Standing fan', watts: 60, hours: 8, duty: 1, when: 'ALL', surge: 1.5 },
  { name: 'TV (LED, 43")', watts: 90, hours: 6, duty: 1, when: 'NIGHT', surge: 1 },
  { name: 'Decoder', watts: 20, hours: 6, duty: 1, when: 'NIGHT', surge: 1 },
  { name: 'Fridge', watts: 150, hours: 24, duty: 0.4, when: 'ALL', surge: 4 },
  { name: 'Chest freezer', watts: 200, hours: 24, duty: 0.45, when: 'ALL', surge: 4 },
  { name: 'Air conditioner 1HP (inverter)', watts: 800, hours: 6, duty: 0.6, when: 'NIGHT', surge: 3 },
  { name: 'Air conditioner 1.5HP', watts: 1200, hours: 6, duty: 0.6, when: 'NIGHT', surge: 4 },
  { name: 'Wi-Fi router', watts: 12, hours: 24, duty: 1, when: 'ALL', surge: 1 },
  { name: 'Laptop', watts: 65, hours: 6, duty: 1, when: 'DAY', surge: 1 },
  { name: 'Desktop computer', watts: 200, hours: 6, duty: 1, when: 'DAY', surge: 1 },
  { name: 'Phone charger', watts: 10, hours: 3, duty: 1, when: 'ALL', surge: 1 },
  { name: 'Electric iron', watts: 1000, hours: 0.5, duty: 0.7, when: 'DAY', surge: 1 },
  { name: 'Microwave', watts: 1200, hours: 0.5, duty: 1, when: 'DAY', surge: 1.5 },
  { name: 'Electric kettle', watts: 1800, hours: 0.3, duty: 1, when: 'DAY', surge: 1 },
  { name: 'Water pump 0.5HP', watts: 400, hours: 1, duty: 1, when: 'DAY', surge: 4 },
  { name: 'Washing machine', watts: 500, hours: 1, duty: 0.6, when: 'DAY', surge: 3 },
  { name: 'Blender', watts: 400, hours: 0.2, duty: 1, when: 'DAY', surge: 2 },
  { name: 'CCTV + DVR (4 cameras)', watts: 40, hours: 24, duty: 1, when: 'ALL', surge: 1 },
  { name: 'Security light', watts: 30, hours: 12, duty: 1, when: 'NIGHT', surge: 1 },
  { name: 'Water heater (shower)', watts: 3000, hours: 0.5, duty: 1, when: 'DAY', surge: 1 },
];

// Best guess for a new appliance from its name, so a scanned label still gets a sensible duty cycle and surge.
export function guessFromName(name: string): Pick<Preset, 'duty' | 'surge' | 'when' | 'hours'> {
  const n = name.toLowerCase();
  const hit = PRESETS.find((p) => n.includes(p.name.toLowerCase().split(' ')[0]) && p.name.toLowerCase().split(' ')[0].length > 3);
  if (/fridge|refrigerator/.test(n)) return { duty: 0.4, surge: 4, when: 'ALL', hours: 24 };
  if (/freezer/.test(n)) return { duty: 0.45, surge: 4, when: 'ALL', hours: 24 };
  if (/\bac\b|air.?con|split unit/.test(n)) return { duty: 0.6, surge: 4, when: 'NIGHT', hours: 6 };
  if (/pump|borehole/.test(n)) return { duty: 1, surge: 4, when: 'DAY', hours: 1 };
  if (hit) return { duty: hit.duty, surge: hit.surge, when: hit.when, hours: hit.hours };
  return { duty: 1, surge: 1, when: 'ALL', hours: 4 };
}

// ---- helpers ------------------------------------------------------------------------------------------------------------
const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round = (x: number, dp = 0) => { const f = 10 ** dp; return Math.round(x * f) / f; };

// Hours are capped to the window the appliance runs in (a "night" appliance cannot run 20 hours of a 12 hour night).
export const maxHours = (w: When) => (w === 'ALL' ? 24 : DAY_HOURS);
export function energy(a: Appliance): { dayWh: number; nightWh: number } {
  const h = clamp(num(a.hours), 0, maxHours(a.when));
  const wh = Math.max(0, num(a.watts)) * Math.max(0, num(a.qty)) * clamp(num(a.duty, 1), 0, 1) * h;
  return a.when === 'DAY' ? { dayWh: wh, nightWh: 0 } : a.when === 'NIGHT' ? { dayWh: 0, nightWh: wh } : { dayWh: wh / 2, nightWh: wh / 2 };
}

export function fmtHM(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—';
  if (hours > 99) return '99+ hrs';
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)} hrs ${String(m % 60).padStart(2, '0')} mins`;
}
export const fmtKwh = (wh: number) => `${round(wh / 1000, 2)} kWh`;
export const fmtW = (w: number) => (w >= 1000 ? `${round(w / 1000, 2)} kW` : `${round(w)} W`);

// ---- the design ---------------------------------------------------------------------------------------------------------
export interface Design {
  appliances: Appliance[];
  unitId: string; // a BATTERY_UNITS id, or 'custom'
  custom: { volts: number; ah: number; chem: Chem };
  batteryQty: number;
  panelWatts: number;
  panels: number;
  region: string;
  pshOverride: number | null;
  conservative: boolean;
  invEff: number;
}

export const newDesign = (region = 'Lagos'): Design => ({
  appliances: [], unitId: 'li-48-100', custom: { volts: 48, ah: 100, chem: 'LITHIUM' }, batteryQty: 1, panelWatts: 550, panels: 4,
  region, pshOverride: null, conservative: true, invEff: 0.88,
});

export function batteryUnit(d: Pick<Design, 'unitId' | 'custom'>): BatteryUnit {
  const u = unitById(d.unitId);
  if (u) return u;
  const c = d.custom;
  return { id: 'custom', label: `${c.volts}V ${c.ah}Ah ${c.chem === 'LITHIUM' ? 'lithium' : 'lead-acid'}`, volts: clamp(num(c.volts, 12), 1, 100), ah: clamp(num(c.ah, 100), 1, 2000), chem: c.chem };
}

// DC bus voltage the inverter will run at: set by the load, but never below the battery's own voltage.
export function systemVoltage(peakW: number, unitVolts = 12): number {
  const byLoad = peakW <= 1200 ? 12 : peakW <= 3200 ? 24 : 48;
  return Math.max(byLoad, unitVolts);
}

export interface Warning { level: 'info' | 'warn' | 'bad'; text: string }
export interface Analysis {
  peakW: number; surgeW: number; avgRunW: number;
  dailyWh: number; dayWh: number; nightWh: number;
  unit: BatteryUnit; qty: number; nominalWh: number; usableWh: number; dod: number;
  systemV: number; seriesFactor: number; maxContinuousW: number;
  runtimeH: number | null; runtimePeakH: number | null;
  psh: number; harvestWh: number; arrayW: number;
  daytimeDcWh: number; surplusWh: number; refillWh: number; chargeHours: number | null;
  nightLoadW: number; nightCoverHours: number | null; nightGapAcWh: number;
  verdict: 'SUSTAINABLE' | 'BATTERY_SHORT' | 'SOLAR_SHORT' | 'BOTH_SHORT' | 'NO_LOAD';
  warnings: Warning[];
}

export function analyse(d: Design): Analysis {
  const on = d.appliances.filter((a) => a.on && num(a.qty) > 0 && num(a.watts) > 0 && num(a.hours) > 0);
  const peakW = on.reduce((s, a) => s + a.watts * a.qty, 0);
  const avgRunW = on.reduce((s, a) => s + a.watts * a.qty * clamp(num(a.duty, 1), 0, 1), 0);
  const surgeExtra = on.reduce((m, a) => Math.max(m, a.watts * (clamp(num(a.surge, 1), 1, 10) - 1)), 0); // one motor starting at a time
  const surgeW = peakW + surgeExtra;
  let dayWh = 0, nightWh = 0;
  for (const a of on) { const e = energy(a); dayWh += e.dayWh; nightWh += e.nightWh; }
  const dailyWh = dayWh + nightWh;

  const unit = batteryUnit(d);
  const qty = clamp(Math.round(num(d.batteryQty, 1)), 1, 40);
  const dod = DOD[unit.chem];
  const nominalWh = unitWh(unit) * qty;
  const usableWh = nominalWh * dod;
  const systemV = systemVoltage(peakW, unit.volts);
  const seriesFactor = Math.max(1, Math.round(systemV / unit.volts));
  const parallelStrings = Math.max(0, Math.floor(qty / seriesFactor));
  const maxContinuousW = systemV * unit.ah * parallelStrings * MAX_C[unit.chem] * d.invEff;

  const runtimeH = avgRunW > 0 ? (usableWh * d.invEff) / avgRunW : null;
  const runtimePeakH = peakW > 0 ? (usableWh * d.invEff) / peakW : null;

  const psh = effectivePsh(d.region, d.pshOverride, d.conservative);
  const arrayW = Math.max(0, num(d.panelWatts)) * Math.max(0, Math.round(num(d.panels)));
  const harvestWh = arrayW * psh * SOLAR_DERATE;
  const rt = ROUND_TRIP[unit.chem];
  const daytimeDcWh = dayWh / d.invEff; // the sun powers daytime appliances first
  const surplusWh = harvestWh - daytimeDcWh;
  const nightDcWh = nightWh / d.invEff;
  const nightLoadW = nightWh / DAY_HOURS;
  const nightCoverHours = nightLoadW > 0 ? (usableWh * d.invEff) / nightLoadW : null;
  // What the sun has to put back into the battery each day: what the night takes out, or the whole bank if it is smaller.
  const refillWh = Math.min(usableWh, nightDcWh) / rt;
  const chargeHours = surplusWh > 0 ? refillWh / (surplusWh / psh) : null;
  const delivered = Math.max(0, Math.min(usableWh, nightDcWh, Math.max(0, surplusWh) * rt));
  const nightGapAcWh = Math.max(0, (nightDcWh - delivered) * d.invEff);

  const batteryShort = nightCoverHours !== null && nightCoverHours < DAY_HOURS - 0.01;
  const solarShort = surplusWh < refillWh - 0.5;
  const verdict: Analysis['verdict'] = dailyWh === 0 ? 'NO_LOAD' : batteryShort && solarShort ? 'BOTH_SHORT' : batteryShort ? 'BATTERY_SHORT' : solarShort ? 'SOLAR_SHORT' : 'SUSTAINABLE';

  const warnings: Warning[] = [];
  const kwWord = (w: number) => fmtW(w);
  if (nightDcWh > usableWh + 1) warnings.push({ level: 'bad', text: `Your night loads need ${fmtKwh(nightDcWh)} but this battery bank only gives ${fmtKwh(usableWh)} safely. It would be drained past its ${round(dod * 100)}% limit, which shortens its life. Add batteries or switch some loads off.` });
  if (parallelStrings === 0 && peakW > 0) warnings.push({ level: 'bad', text: `A ${systemV}V system needs ${seriesFactor} of these ${unit.volts}V batteries wired in series. You have ${qty}.` });
  else if (qty % seriesFactor !== 0) warnings.push({ level: 'warn', text: `A ${systemV}V system takes batteries in groups of ${seriesFactor}. ${qty % seriesFactor} battery(ies) would be left over, so use ${Math.ceil(qty / seriesFactor) * seriesFactor}.` });
  if (peakW > 0 && parallelStrings > 0 && peakW > maxContinuousW) warnings.push({ level: 'warn', text: `Running ${kwWord(peakW)} at once is more than this bank should supply continuously (about ${kwWord(maxContinuousW)} for ${unit.chem === 'LITHIUM' ? 'lithium' : 'lead-acid'}). Add batteries in parallel or shed the heavy loads.` });
  if (surgeW > peakW * 1 && peakW > 0) warnings.push({ level: 'info', text: `Motors (fridge, AC, pump) pull about ${kwWord(surgeW)} for a moment when they start. The inverter must handle that surge.` });
  if (surplusWh < 0 && dailyWh > 0) warnings.push({ level: 'bad', text: `The panels (${fmtKwh(harvestWh)}/day) cannot even cover the daytime loads (${fmtKwh(daytimeDcWh)}).` });
  if (chargeHours !== null && chargeHours > psh) warnings.push({ level: 'warn', text: `It takes about ${round(chargeHours, 1)} sun-hours to refill the battery but you only get ${psh}. Add panels or shed daytime loads.` });
  if (d.conservative) warnings.push({ level: 'info', text: 'Sized for the rainy season / harmattan (20% less sun). Switch it off to see an average day.' });

  return { peakW, surgeW, avgRunW, dailyWh, dayWh, nightWh, unit, qty, nominalWh, usableWh, dod, systemV, seriesFactor, maxContinuousW, runtimeH, runtimePeakH, psh, harvestWh, arrayW, daytimeDcWh, surplusWh, refillWh, chargeHours, nightLoadW, nightCoverHours, nightGapAcWh, verdict, warnings };
}

// ---- recommendation engine ----------------------------------------------------------------------------------------------
export type Goal = { type: 'hours'; hours: number } | { type: 'offgrid' };
export interface Recommendation {
  inverterKva: number; inverterW: number; systemV: number;
  unit: BatteryUnit; qty: number; seriesFactor: number; usableWh: number; nominalWh: number;
  panelWatts: number; panels: number; harvestWh: number;
  needUsableWh: number; goal: Goal; chem: Chem; moreThanFour: boolean; notes: string[];
}

export function recommend(d: Design, goal: Goal, chem: Chem, reservePct = 20): Recommendation {
  const a = analyse(d);
  const notes: string[] = [];
  // Inverter: running load + 25% safety margin, and big enough that the start-up surge of the biggest motor stays within ~2x rating.
  const inverterW = Math.max(a.peakW * 1.25, a.surgeW / 2);
  const kvaNeeded = inverterW / (INVERTER_PF * 1000);
  const inverterKva = INVERTER_SIZES_KVA.find((k) => k >= kvaNeeded) ?? Math.ceil(kvaNeeded);
  const systemV = systemVoltage(inverterKva * INVERTER_PF * 1000, 12);

  // Battery energy the goal asks for.
  const reserve = 1 + reservePct / 100;
  const needUsableWh = goal.type === 'hours'
    ? (a.avgRunW * goal.hours) / d.invEff
    : (a.nightWh / d.invEff) * reserve;
  if (goal.type === 'offgrid') notes.push(`Battery covers the ${DAY_HOURS}-hour night plus a ${reservePct}% reserve for cloudy days.`);
  else notes.push(`Battery runs your ON appliances for ${goal.hours} hours with no sun (what the cut lasts).`);

  const candidates = BATTERY_UNITS.filter((u) => u.chem === chem && u.volts <= systemV && systemV % u.volts === 0)
    .map((u) => {
      const series = systemV / u.volts;
      const per = unitWh(u) * DOD[chem];
      const qty = Math.max(series, Math.ceil(needUsableWh / per / series) * series);
      return { u, series, qty, nominal: unitWh(u) * qty };
    });
  const pool = candidates.length ? candidates : BATTERY_UNITS.filter((u) => u.chem === chem).map((u) => { const per = unitWh(u) * DOD[chem]; const qty = Math.max(1, Math.ceil(needUsableWh / per)); return { u, series: 1, qty, nominal: unitWh(u) * qty }; });
  const withinFour = pool.filter((c) => c.qty <= 4).sort((x, y) => x.nominal - y.nominal || x.qty - y.qty);
  const pick = withinFour[0] ?? pool.sort((x, y) => unitWh(y.u) - unitWh(x.u))[0];
  const moreThanFour = pick.qty > 4;
  if (moreThanFour) notes.push(`This needs ${pick.qty} batteries of the largest size available. Consider shedding loads or splitting into two banks.`);
  if (chem === 'LEAD_ACID') notes.push('Lead-acid only gives you 50% of its rating and wants gentle loads. Lithium needs fewer batteries for the same backup.');
  const usableWh = pick.nominal * DOD[chem];

  // Panels: carry the daytime loads AND fully recharge the recommended bank within the day's sun.
  const psh = effectivePsh(d.region, d.pshOverride, d.conservative);
  const dailyDcNeed = a.dayWh / d.invEff + usableWh / ROUND_TRIP[chem];
  const panelWatts = d.panelWatts;
  const panels = Math.max(1, Math.ceil(dailyDcNeed / (panelWatts * psh * SOLAR_DERATE)));
  const harvestWh = panels * panelWatts * psh * SOLAR_DERATE;
  notes.push(`${psh} peak sun hours used (${d.conservative ? 'rainy-season' : 'average'}).`);
  if (a.peakW === 0) notes.push('Add and switch on some appliances first, then these numbers mean something.');
  return { inverterKva, inverterW: inverterKva * INVERTER_PF * 1000, systemV, unit: pick.u, qty: pick.qty, seriesFactor: pick.series, usableWh, nominalWh: pick.nominal, panelWatts, panels, harvestWh, needUsableWh, goal, chem, moreThanFour, notes };
}

// Apply a recommendation to the design (sets the battery + panel count the simulator shows).
export function applyRecommendation(d: Design, r: Recommendation): Design {
  return { ...d, unitId: r.unit.id, batteryQty: r.qty, panels: r.panels, panelWatts: r.panelWatts };
}

// Plain-text spec sheet: for WhatsApp and for the printable page.
export function specLines(d: Design, r: Recommendation): string[] {
  const a = analyse(d);
  return [
    `Inverter: ${r.inverterKva} kVA (${fmtW(r.inverterW)}), ${r.systemV}V system`,
    `Batteries: ${r.qty} x ${r.unit.label}${r.seriesFactor > 1 ? ` (${r.seriesFactor} in series per string)` : ''} = ${fmtKwh(r.nominalWh)} (${fmtKwh(r.usableWh)} usable)`,
    `Solar panels: ${r.panels} x ${r.panelWatts} W = ${fmtW(r.panels * r.panelWatts)}`,
    `Daily energy use: ${fmtKwh(a.dailyWh)} | Peak load: ${fmtW(a.peakW)} | Surge: ${fmtW(a.surgeW)}`,
    `Expected daily solar: ${fmtKwh(r.harvestWh)} at ${a.psh} sun hours`,
  ];
}

// ---- 24-hour simulation (the control-room chart) ------------------------------------------------------------------------
export interface HourPoint { hour: number; genW: number; loadW: number; soc: number; socPct: number; shortfallWh: number }
// Sun follows a half-sine between 06:00 and 18:00 scaled so a day adds up to the real harvest; daytime loads run evenly through
// the day, night loads through the night. Run for several days from a full battery and keep the last, so it shows the steady
// daily loop rather than the lucky first day. soc is the energy left in the usable part of the bank (Wh).
export function simulateDay(d: Design): HourPoint[] {
  const a = analyse(d);
  const rt = ROUND_TRIP[a.unit.chem];
  const w = Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 18 ? Math.sin((Math.PI * (h - 6 + 0.5)) / 12) : 0));
  const wSum = w.reduce((s, x) => s + x, 0) || 1;
  let soc = a.usableWh;
  let out: HourPoint[] = [];
  for (let day = 0; day < 4; day++) {
    out = [];
    for (let h = 0; h < 24; h++) {
      const gen = a.harvestWh * (w[h] / wSum);
      const isDay = h >= 6 && h < 18;
      const loadDc = (isDay ? a.dayWh : a.nightWh) / d.invEff / DAY_HOURS;
      const net = gen - loadDc;
      let short = 0;
      if (net >= 0) soc = Math.min(a.usableWh, soc + net * rt);
      else if (soc + net >= 0) soc += net;
      else { short = -(soc + net); soc = 0; }
      out.push({ hour: h, genW: gen, loadW: loadDc, soc, socPct: a.usableWh > 0 ? (soc / a.usableWh) * 100 : 0, shortfallWh: short });
    }
  }
  return out;
}
