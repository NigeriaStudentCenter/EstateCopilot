// Building materials estimator: tiles, blockwork, plaster, screed, concrete and roofing sheets. Pure functions, no React:
// the app calls them on every keystroke and the tests (artisan-portal/scripts/building-check.mts) call them directly.
//
// Every job turns its inputs into a list of material lines. Lines from all jobs in a project are added up BEFORE rounding,
// so cement for blockwork, plaster and screed is bought as one number of bags, not three rounded-up numbers.
// These are estimates for ordering. Site conditions, the supplier's product sizes and the engineer's design win.

export type Unit = 'pcs' | 'carton' | 'bag' | 'kg' | 'm3' | 'm' | 'm2' | 'length';
export interface Line {
  key: string; // identity for adding up across jobs, e.g. "cement|bag"
  name: string;
  exact: number; // unrounded quantity
  unit: Unit;
  spec?: string; // e.g. "60x60 porcelain", "9 inch"
  catalogueId?: string; // Kolo catalogue id, for supplier prices later
  note?: string;
}

const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round = (x: number, dp = 0) => { const f = 10 ** dp; return Math.round(x * f) / f; };

export const BAG_KG = 50;
export const CEMENT_DENSITY = 1440; // kg per m3 loose
export const BAG_M3 = BAG_KG / CEMENT_DENSITY; // 0.0347 m3 of cement per bag
export const SAND_DENSITY = 1600; // kg per m3, for the tonnes figure
export const GRANITE_DENSITY = 1500;
export const MORTAR_DRY_FACTOR = 1.3; // wet volume -> dry materials (mortar, plaster, screed)
export const CONCRETE_DRY_FACTOR = 1.54;

// ---- cement, sand and aggregate for a wet volume at a mix ratio ----------------------------------------------------------
export const MIXES = {
  '1:3': [1, 3], '1:4': [1, 4], '1:5': [1, 5], '1:6': [1, 6], '1:8': [1, 8],
  '1:3:6': [1, 3, 6], '1:2:4': [1, 2, 4], '1:1.5:3': [1, 1.5, 3],
} as const;
export type MixId = keyof typeof MIXES;

export function mix(wetM3: number, ratio: readonly number[], dryFactor: number) {
  const dry = Math.max(0, wetM3) * dryFactor;
  const parts = ratio.reduce((s, p) => s + p, 0);
  const cementM3 = (dry * ratio[0]) / parts;
  return { bags: cementM3 / BAG_M3, sandM3: (dry * ratio[1]) / parts, graniteM3: ratio[2] ? (dry * ratio[2]) / parts : 0 };
}

const cementLine = (bags: number, note?: string): Line => ({ key: 'cement|bag', name: 'Cement (50kg bag)', exact: bags, unit: 'bag', catalogueId: 'cement', note });
const sandLine = (m3: number, soft: boolean): Line => soft
  ? { key: 'plaster-sand|m3', name: 'Plaster sand (soft sand)', exact: m3, unit: 'm3', catalogueId: 'plaster-sand' }
  : { key: 'sharp-sand|m3', name: 'Sharp sand', exact: m3, unit: 'm3', catalogueId: 'sharp-sand' };
const graniteLine = (m3: number): Line => ({ key: 'granite|m3', name: 'Granite (chippings)', exact: m3, unit: 'm3', spec: '3/4 inch', catalogueId: 'granite' });

// ---- the jobs --------------------------------------------------------------------------------------------------------------
export interface TileJob { kind: 'tiles'; id: string; label: string; lengthM: number; widthM: number; deductM2: number; tileWmm: number; tileLmm: number; material: 'porcelain' | 'ceramic'; pattern: 'straight' | 'diagonal' | 'herringbone'; wastePct: number; perCarton: number; jointMm: number; skirtingM: number }
export interface BlockJob { kind: 'blocks'; id: string; label: string; lengthM: number; heightM: number; openingsM2: number; thicknessMm: 100 | 150 | 225; mortar: '1:4' | '1:5' | '1:6' | '1:8'; wastePct: number }
export interface PlasterJob { kind: 'plaster'; id: string; label: string; areaM2: number; thicknessMm: number; mortar: '1:3' | '1:4' | '1:5' | '1:6'; wastePct: number }
export interface ScreedJob { kind: 'screed'; id: string; label: string; areaM2: number; thicknessMm: number; mortar: '1:3' | '1:4'; wastePct: number }
export interface ConcreteJob { kind: 'concrete'; id: string; label: string; lengthM: number; widthM: number; depthM: number; mix: '1:3:6' | '1:2:4' | '1:1.5:3'; wastePct: number }
export interface RoofJob { kind: 'roof'; id: string; label: string; roofType: 'gable' | 'hip' | 'mono'; lengthM: number; widthM: number; overhangM: number; pitchDeg: number; covering: 'longspan' | 'corrugated' | 'stone'; coverWidthM: number; stonePerM2: number; maxSheetM: number; wastePct: number; gutter: boolean; foil: boolean }
export type Job = TileJob | BlockJob | PlasterJob | ScreedJob | ConcreteJob | RoofJob;
export type JobKind = Job['kind'];

export const KIND_LABEL: Record<JobKind, string> = { tiles: 'Tiling', blocks: 'Blockwork', plaster: 'Plaster / render', screed: 'Screed', concrete: 'Concrete (non-structural)', roof: 'Roofing sheets' };

export const TILE_SIZES: { w: number; l: number; label: string; perCarton: number }[] = [
  { w: 300, l: 300, label: '30 x 30', perCarton: 11 },
  { w: 400, l: 400, label: '40 x 40', perCarton: 6 },
  { w: 600, l: 600, label: '60 x 60', perCarton: 4 },
  { w: 300, l: 600, label: '30 x 60', perCarton: 8 },
  { w: 600, l: 1200, label: '60 x 120', perCarton: 2 },
];
export const PATTERN_WASTE = { straight: 10, diagonal: 15, herringbone: 20 } as const;
export const BLOCK_SIZE = { 100: { l: 0.45, h: 0.225, t: 0.1, name: '4 inch' }, 150: { l: 0.45, h: 0.225, t: 0.15, name: '6 inch' }, 225: { l: 0.45, h: 0.225, t: 0.225, name: '9 inch' } } as const;
export const JOINT_M = 0.01;

export const newJob = (kind: JobKind, id: string): Job => {
  const label = KIND_LABEL[kind];
  switch (kind) {
    case 'tiles': return { kind, id, label, lengthM: 4, widthM: 3, deductM2: 0, tileWmm: 600, tileLmm: 600, material: 'porcelain', pattern: 'straight', wastePct: 10, perCarton: 4, jointMm: 3, skirtingM: 0 };
    case 'blocks': return { kind, id, label, lengthM: 10, heightM: 3, openingsM2: 0, thicknessMm: 225, mortar: '1:6', wastePct: 5 };
    case 'plaster': return { kind, id, label, areaM2: 30, thicknessMm: 12, mortar: '1:4', wastePct: 10 };
    case 'screed': return { kind, id, label, areaM2: 20, thicknessMm: 40, mortar: '1:4', wastePct: 10 };
    case 'concrete': return { kind, id, label, lengthM: 4, widthM: 3, depthM: 0.1, mix: '1:2:4', wastePct: 5 };
    case 'roof': return { kind, id, label, roofType: 'gable', lengthM: 10, widthM: 8, overhangM: 0.4, pitchDeg: 15, covering: 'longspan', coverWidthM: 0.85, stonePerM2: 2.7, maxSheetM: 12, wastePct: 5, gutter: true, foil: false };
  }
};

// m2 of adhesive coverage per 25kg bag by tile size (bigger tiles need a thicker bed).
export const adhesiveCoverage = (wmm: number, lmm: number) => { const m = Math.max(wmm, lmm); return m <= 400 ? 5 : m <= 600 ? 4 : 3; };
const tileThicknessMm = (wmm: number, lmm: number) => { const m = Math.max(wmm, lmm); return m <= 400 ? 8 : m <= 600 ? 9 : 10; };

export function tileResult(j: TileJob) {
  const area = Math.max(0, num(j.lengthM) * num(j.widthM) - num(j.deductM2));
  const w = clamp(num(j.tileWmm, 600), 50, 3000), l = clamp(num(j.tileLmm, 600), 50, 3000);
  const tileM2 = (w * l) / 1e6;
  const waste = 1 + clamp(num(j.wastePct), 0, 50) / 100;
  const pieces = Math.ceil((area * waste) / tileM2 - 1e-9);
  const perCarton = Math.max(1, Math.round(num(j.perCarton, 4)));
  const cartons = pieces / perCarton;
  const bags = (area / adhesiveCoverage(w, l)) * 1.1;
  const joint = clamp(num(j.jointMm, 3), 1, 20);
  const grout = area * (((l + w) / (l * w)) * joint * tileThicknessMm(w, l) * 1.6) * 1.1; // kg: ((L+W)/(L x W)) x joint x thickness x 1.6, mm
  const skirting = Math.max(0, num(j.skirtingM));
  return { area, tileM2, pieces, cartons, bags, groutKg: grout, spacers: pieces * 1.2, skirtingPieces: skirting > 0 ? Math.ceil((skirting * 1.05) / 0.6 - 1e-9) : 0, perCarton };
}

export function blockResult(j: BlockJob) {
  const gross = Math.max(0, num(j.lengthM) * num(j.heightM));
  const net = Math.max(0, gross - num(j.openingsM2));
  const b = BLOCK_SIZE[j.thicknessMm] ?? BLOCK_SIZE[225];
  const perM2 = 1 / ((b.l + JOINT_M) * (b.h + JOINT_M));
  const exactBlocks = net * perM2;
  const blocks = Math.ceil(exactBlocks * (1 + clamp(num(j.wastePct), 0, 30) / 100) - 1e-9);
  const mortarWet = Math.max(0, net * b.t - exactBlocks * b.l * b.h * b.t) * 1.1; // volume left between the blocks, plus 10% lost in handling
  const m = mix(mortarWet, MIXES[j.mortar] ?? MIXES['1:6'], MORTAR_DRY_FACTOR);
  return { gross, net, perM2, blocks, mortarWet, ...m };
}

export function plasterResult(j: PlasterJob) {
  const wet = Math.max(0, num(j.areaM2)) * (clamp(num(j.thicknessMm, 12), 3, 60) / 1000) * (1 + clamp(num(j.wastePct), 0, 40) / 100);
  return { wet, ...mix(wet, MIXES[j.mortar] ?? MIXES['1:4'], MORTAR_DRY_FACTOR) };
}
export function screedResult(j: ScreedJob) {
  const wet = Math.max(0, num(j.areaM2)) * (clamp(num(j.thicknessMm, 40), 10, 150) / 1000) * (1 + clamp(num(j.wastePct), 0, 40) / 100);
  return { wet, ...mix(wet, MIXES[j.mortar] ?? MIXES['1:4'], MORTAR_DRY_FACTOR) };
}
export function concreteResult(j: ConcreteJob) {
  const wet = Math.max(0, num(j.lengthM)) * Math.max(0, num(j.widthM)) * Math.max(0, num(j.depthM)) * (1 + clamp(num(j.wastePct), 0, 30) / 100);
  return { wet, ...mix(wet, MIXES[j.mix] ?? MIXES['1:2:4'], CONCRETE_DRY_FACTOR) };
}

export interface RoofResult {
  slopeM: number; planeAreaM2: number; areaM2: number; planes: number; columns: number; segments: number; sheets: number; sheetLenM: number; runningM: number; stonePieces: number; ridgeM: number; ridgePieces: number; screws: number; gutterM: number; gutterPieces: number; downpipes: number; foilM2: number; warnings: string[];
}
export function roofResult(j: RoofJob): RoofResult {
  const L = Math.max(0, num(j.lengthM)), W = Math.max(0, num(j.widthM)), ov = clamp(num(j.overhangM, 0.4), 0, 1.5);
  const pitch = clamp(num(j.pitchDeg, 15), 0, 60), rad = (pitch * Math.PI) / 180, cos = Math.cos(rad);
  const planArea = (L + 2 * ov) * (W + 2 * ov);
  const areaM2 = planArea / cos; // a roof with one pitch on every plane has area = plan area / cos(pitch), whatever the shape
  const run = j.roofType === 'mono' ? W + ov : W / 2 + ov;
  const slopeM = run / cos;
  const planes = j.roofType === 'gable' ? 2 : j.roofType === 'mono' ? 1 : 0;
  const cover = clamp(num(j.coverWidthM, 0.85), 0.3, 1.5);
  const maxLen = clamp(num(j.maxSheetM, 12), 2, 20), lap = 0.15;
  const waste = 1 + clamp(num(j.wastePct), 0, 30) / 100;
  const warnings: string[] = [];
  let columns = 0, segments = 1, sheets = 0, runningM = 0;
  if (j.covering === 'stone') { /* counted by area below */ }
  else if (planes > 0) {
    columns = Math.ceil((L + 2 * ov) / cover - 1e-9);
    segments = slopeM > maxLen ? Math.ceil((slopeM - lap) / (maxLen - lap) - 1e-9) : 1;
    sheets = columns * planes * segments;
    runningM = columns * planes * slopeM * waste + (segments > 1 ? columns * planes * (segments - 1) * lap : 0);
  } else {
    runningM = (areaM2 / cover) * (waste + 0.1); // hip roofs: sheets are cut to every length, so allow 10% more for the cuts
    columns = 0;
  }
  const stonePieces = j.covering === 'stone' ? Math.ceil(areaM2 * clamp(num(j.stonePerM2, 2.7), 1, 6) * waste - 1e-9) : 0;
  const halfSpan = W / 2 + ov;
  const hip = Math.sqrt(2 * halfSpan * halfSpan + (halfSpan * Math.tan(rad)) ** 2);
  const ridgeM = j.roofType === 'gable' ? L : j.roofType === 'hip' ? Math.max(L - W, 0) + 4 * hip : L; // mono: the flashing along the high wall
  const ridgePieces = Math.ceil((ridgeM * 1.05) / 2 - 1e-9);
  const screws = Math.ceil(areaM2 * (j.covering === 'stone' ? 8 : 6) * 1.1);
  const gutterM = j.gutter ? (j.roofType === 'mono' ? L : j.roofType === 'gable' ? 2 * L : 2 * (L + W)) : 0;
  const gutterPieces = gutterM > 0 ? Math.ceil(gutterM / 3 - 1e-9) : 0;
  const downpipes = gutterM > 0 ? Math.max(j.roofType === 'mono' ? 1 : 2, Math.ceil(gutterM / 10 - 1e-9)) : 0;
  if (j.covering !== 'stone' && pitch < 5) warnings.push('Under 5 degrees, long-span and corrugated sheets leak at the laps. Check the maker\'s minimum pitch.');
  else if (j.covering === 'stone' && pitch < 15) warnings.push('Stone-coated tiles need about 15 degrees or more. Check the maker\'s minimum pitch.');
  if (planes > 0 && j.covering !== 'stone' && slopeM > 8) warnings.push(`Each sheet is ${round(slopeM, 1)} m long. Check transport and handling, and that the purlins carry it.`);
  if (ov > 0.6) warnings.push('An overhang over 0.6 m needs extra support. Check the roof structure.');
  if (j.roofType === 'hip') warnings.push('Hip roofs are estimated from the roof area with 10% extra for cuts. Measure each plane before you order.');
  warnings.push('This counts sheets and fixings only. Purlin spacing, trusses and wind fixing must follow the roof design.');
  return { slopeM, planeAreaM2: planArea, areaM2, planes, columns, segments, sheets, sheetLenM: slopeM, runningM, stonePieces, ridgeM, ridgePieces, screws, gutterM, gutterPieces, downpipes, foilM2: j.foil ? areaM2 * 1.1 : 0, warnings };
}

// ---- job -> material lines --------------------------------------------------------------------------------------------------
export function jobLines(j: Job): Line[] {
  switch (j.kind) {
    case 'tiles': {
      const r = tileResult(j), size = `${Math.round(j.tileWmm)}x${Math.round(j.tileLmm)}`, spec = `${size} ${j.material}`;
      const out: Line[] = [
        { key: `tile|${spec}|carton`, name: 'Floor tiles', exact: r.cartons, unit: 'carton', spec, catalogueId: 'tile-floor', note: `${r.pieces} tiles, ${r.perCarton} per carton` },
        { key: 'tile-adhesive|bag', name: 'Tile adhesive (25kg bag)', exact: r.bags, unit: 'bag', spec: '25kg', catalogueId: 'tile-adhesive' },
        { key: 'tile-grout|kg', name: 'Tile grout', exact: r.groutKg, unit: 'kg', catalogueId: 'tile-grout' },
        { key: 'tile-spacers|pcs', name: 'Tile spacers', exact: r.spacers, unit: 'pcs', spec: `${Math.round(j.jointMm)}mm`, catalogueId: 'tile-spacers' },
      ];
      if (r.skirtingPieces > 0) out.push({ key: 'tile-skirting|pcs', name: 'Skirting tiles', exact: r.skirtingPieces, unit: 'pcs', spec: '10x60', catalogueId: 'tile-skirting' });
      return out;
    }
    case 'blocks': {
      const r = blockResult(j), b = BLOCK_SIZE[j.thicknessMm] ?? BLOCK_SIZE[225];
      return [
        { key: `block|${b.name}|pcs`, name: 'Sandcrete blocks', exact: r.blocks, unit: 'pcs', spec: b.name, catalogueId: 'sandcrete-block', note: `${round(r.perM2, 2)} per m2` },
        cementLine(r.bags, 'mortar'), sandLine(r.sandM3, true),
      ];
    }
    case 'plaster': { const r = plasterResult(j); return [cementLine(r.bags, 'plaster'), sandLine(r.sandM3, true)]; }
    case 'screed': { const r = screedResult(j); return [cementLine(r.bags, 'screed'), sandLine(r.sandM3, false)]; }
    case 'concrete': { const r = concreteResult(j); return [cementLine(r.bags, 'concrete'), sandLine(r.sandM3, false), graniteLine(r.graniteM3)]; }
    case 'roof': {
      const r = roofResult(j);
      const out: Line[] = [];
      if (j.covering === 'stone') out.push({ key: 'roof-stone|pcs', name: 'Stone-coated roofing tiles', exact: r.stonePieces, unit: 'pcs', catalogueId: 'roof-stone-coated' });
      else out.push({ key: `roof-sheet|${j.covering}|m`, name: j.covering === 'longspan' ? 'Long-span aluminium roofing sheet' : 'Corrugated roofing sheet', exact: r.runningM, unit: 'm', catalogueId: 'roof-sheet', note: r.sheets > 0 ? `${r.sheets} sheets of ${round(r.sheetLenM, 2)} m` : 'cut to length' });
      out.push({ key: 'roof-ridge|length', name: j.roofType === 'mono' ? 'Wall flashing / ridge cap' : 'Ridge cap', exact: r.ridgePieces, unit: 'length', spec: '2 m pieces', catalogueId: 'roof-ridge' });
      out.push({ key: 'roof-screws|pcs', name: 'Roofing screws (with washers)', exact: r.screws, unit: 'pcs', catalogueId: 'roof-screws' });
      if (r.gutterPieces > 0) { out.push({ key: 'gutter|length', name: 'Gutter', exact: r.gutterPieces, unit: 'length', spec: '3 m', catalogueId: 'gutter' }); out.push({ key: 'downpipe|length', name: 'Downpipe', exact: r.downpipes, unit: 'length', spec: '3 m', catalogueId: 'downpipe' }); }
      if (r.foilM2 > 0) out.push({ key: 'roof-underlay|m2', name: 'Roof underlay / foil insulation', exact: r.foilM2, unit: 'm2', catalogueId: 'roof-underlay' });
      return out;
    }
  }
}

// What to buy: round the SUMMED exact quantity up to a sensible purchase unit.
export function buyQty(l: { exact: number; unit: Unit }): number {
  const x = Math.max(0, l.exact);
  const q = l.unit === 'm3' ? Math.ceil(x * 10 - 1e-9) / 10 : l.unit === 'm' ? Math.ceil(x * 2 - 1e-9) / 2 : Math.ceil(x - 1e-9);
  return q + 0; // turns -0 into 0
}
export const unitText = (u: Unit, q: number) => ({ pcs: 'pcs', carton: q === 1 ? 'carton' : 'cartons', bag: q === 1 ? 'bag' : 'bags', kg: 'kg', m3: 'm³', m: 'm', length: q === 1 ? 'length' : 'lengths', m2: 'm²' }[u]);

export interface Total extends Line { qty: number }
export function totals(jobs: Job[]): Total[] {
  const map = new Map<string, Line>();
  for (const j of jobs) for (const l of jobLines(j)) {
    const prev = map.get(l.key);
    if (prev) prev.exact += l.exact; else map.set(l.key, { ...l });
  }
  const order = ['block', 'cement', 'sharp-sand', 'plaster-sand', 'granite', 'tile', 'tile-adhesive', 'tile-grout', 'tile-spacers', 'tile-skirting', 'roof', 'gutter', 'downpipe'];
  const rank = (k: string) => { const i = order.findIndex((o) => k.startsWith(o)); return i < 0 ? 99 : i; };
  return [...map.values()].map((l) => ({ ...l, qty: buyQty(l), note: l.key === 'cement|bag' ? 'all jobs added together' : l.note })).sort((a, b) => rank(a.key) - rank(b.key));
}
export const costOf = (t: Total, prices: Record<string, number>) => t.qty * Math.max(0, num(prices[t.key]));

export function summaryText(jobs: Job[], prices: Record<string, number>, who: { project: string; customer: string; by: string }): string {
  const t = totals(jobs);
  const naira = (n: number) => `N${Math.round(n).toLocaleString('en-NG')}`;
  let sum = 0;
  const lines = t.map((x) => { const c = costOf(x, prices); sum += c; return `- ${x.name}${x.spec ? ` (${x.spec})` : ''}: ${x.qty} ${unitText(x.unit, x.qty)}${c > 0 ? ` = ${naira(c)}` : ''}`; });
  return [`Materials list${who.customer ? ` for ${who.customer}` : ''}${who.project ? ` (${who.project})` : ''}`, ...lines, ...(sum > 0 ? ['', `Estimated materials cost: ${naira(sum)}`] : []), '', `Prepared by ${who.by} on Estate Copilot Artisans. Estimate only; confirm sizes and quantities with your supplier.`].join('\n');
}
