import { Card } from '../../lib/ui';
import { NumInput, Select, Segmented } from '../tools/parts';
import { Switch } from '../solar/LoadScreen';
import {
  PATTERN_WASTE, TILE_SIZES, blockResult, concreteResult, plasterResult, roofResult, screedResult, tileResult, round, KIND_LABEL,
  type BlockJob, type ConcreteJob, type Job, type PlasterJob, type RoofJob, type ScreedJob, type TileJob,
} from '../../lib/building';

type Set<J> = (f: (j: J) => J) => void;
const Out = ({ items }: { items: [string, string][] }) => (
  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#16241d] p-3 text-white" aria-live="polite">
    {items.map(([k, v]) => <div key={k}><p className="text-[10px] uppercase tracking-wide text-white/60">{k}</p><p className="text-base font-extrabold">{v}</p></div>)}
  </div>
);
const f1 = (x: number) => String(round(x, 1));
const f2 = (x: number) => String(round(x, 2));

function Tiles({ j, set }: { j: TileJob; set: Set<TileJob> }) {
  const r = tileResult(j);
  const sizeKey = `${j.tileWmm}x${j.tileLmm}`;
  const known = TILE_SIZES.find((s) => `${s.w}x${s.l}` === sizeKey);
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2">
        <NumInput label="Length" suffix="m" value={j.lengthM} onChange={(n) => set((x) => ({ ...x, lengthM: n }))} />
        <NumInput label="Width" suffix="m" value={j.widthM} onChange={(n) => set((x) => ({ ...x, widthM: n }))} />
        <NumInput label="Minus" suffix="m²" value={j.deductM2} onChange={(n) => set((x) => ({ ...x, deductM2: n }))} />
      </div>
      <p className="-mt-1 text-xs text-[#8a948d]">"Minus" is anything you do not tile: a bath, a plinth, a fixed unit.</p>
      <Select label="Tile size (cm)" value={known ? sizeKey : 'custom'} options={[...TILE_SIZES.map((s) => ({ v: `${s.w}x${s.l}`, l: s.label })), { v: 'custom', l: 'Other size' }]}
        onChange={(v) => { const s = TILE_SIZES.find((t) => `${t.w}x${t.l}` === v); if (s) set((x) => ({ ...x, tileWmm: s.w, tileLmm: s.l, perCarton: s.perCarton })); }} />
      {!known && <div className="grid grid-cols-2 gap-2"><NumInput label="Width" suffix="mm" value={j.tileWmm} onChange={(n) => set((x) => ({ ...x, tileWmm: n }))} /><NumInput label="Length" suffix="mm" value={j.tileLmm} onChange={(n) => set((x) => ({ ...x, tileLmm: n }))} /></div>}
      <div className="grid grid-cols-2 gap-2">
        <Select label="Tile type" value={j.material} onChange={(v) => set((x) => ({ ...x, material: v }))} options={[{ v: 'porcelain', l: 'Porcelain' }, { v: 'ceramic', l: 'Ceramic' }]} />
        <NumInput label="Tiles per carton" value={j.perCarton} onChange={(n) => set((x) => ({ ...x, perCarton: n }))} />
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Laying pattern (sets the waste)</p>
        <Segmented label="Laying pattern" value={j.pattern} onChange={(v) => set((x) => ({ ...x, pattern: v, wastePct: PATTERN_WASTE[v] }))} options={[{ v: 'straight', l: 'Straight' }, { v: 'diagonal', l: 'Diagonal' }, { v: 'herringbone', l: 'Herringbone' }]} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumInput label="Waste" suffix="%" value={j.wastePct} onChange={(n) => set((x) => ({ ...x, wastePct: n }))} />
        <NumInput label="Joint" suffix="mm" value={j.jointMm} onChange={(n) => set((x) => ({ ...x, jointMm: n }))} />
        <NumInput label="Skirting" suffix="m" value={j.skirtingM} onChange={(n) => set((x) => ({ ...x, skirtingM: n }))} />
      </div>
      <Out items={[['Area', `${f1(r.area)} m²`], ['Tiles', `${r.pieces} pcs`], ['Cartons to buy', `${Math.ceil(r.cartons - 1e-9)}`], ['Adhesive (25kg)', `${Math.ceil(r.bags - 1e-9)} bags`], ['Grout', `${f1(r.groutKg)} kg`], ['Spacers', `${Math.ceil(r.spacers)} pcs`]]} />
    </div>
  );
}

function Blocks({ j, set }: { j: BlockJob; set: Set<BlockJob> }) {
  const r = blockResult(j);
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <NumInput label="Wall length" suffix="m" value={j.lengthM} onChange={(n) => set((x) => ({ ...x, lengthM: n }))} />
        <NumInput label="Wall height" suffix="m" value={j.heightM} onChange={(n) => set((x) => ({ ...x, heightM: n }))} />
      </div>
      <NumInput label="Doors and windows (opening area)" suffix="m²" value={j.openingsM2} onChange={(n) => set((x) => ({ ...x, openingsM2: n }))} />
      <div className="flex gap-2">
        <button type="button" onClick={() => set((x) => ({ ...x, openingsM2: round(x.openingsM2 + 1.89, 2) }))} className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium text-[#42504a]">+ door 2.1 × 0.9</button>
        <button type="button" onClick={() => set((x) => ({ ...x, openingsM2: round(x.openingsM2 + 1.44, 2) }))} className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium text-[#42504a]">+ window 1.2 × 1.2</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Block thickness" value={j.thicknessMm} onChange={(v) => set((x) => ({ ...x, thicknessMm: v }))} options={[{ v: 225, l: '9 inch' }, { v: 150, l: '6 inch' }, { v: 100, l: '4 inch' }]} />
        <Select label="Mortar mix (cement : sand)" value={j.mortar} onChange={(v) => set((x) => ({ ...x, mortar: v }))} options={[{ v: '1:6', l: '1 : 6' }, { v: '1:5', l: '1 : 5' }, { v: '1:4', l: '1 : 4' }, { v: '1:8', l: '1 : 8' }]} />
      </div>
      <NumInput label="Breakage allowance" suffix="%" value={j.wastePct} onChange={(n) => set((x) => ({ ...x, wastePct: n }))} />
      <Out items={[['Wall area', `${f1(r.net)} m²`], ['Blocks', `${r.blocks} pcs`], ['Cement for mortar', `${f1(r.bags)} bags`], ['Sand for mortar', `${f2(r.sandM3)} m³`]]} />
      <p className="text-xs text-[#8a948d]">450 × 225 mm blocks with 10 mm joints ({f2(r.perM2)} blocks per m²). Plaster is a separate job.</p>
    </div>
  );
}

function Plaster({ j, set }: { j: PlasterJob; set: Set<PlasterJob> }) {
  const r = plasterResult(j);
  return (
    <div className="space-y-2.5">
      <NumInput label="Area to plaster (both faces added up)" suffix="m²" value={j.areaM2} onChange={(n) => set((x) => ({ ...x, areaM2: n }))} />
      <div className="grid grid-cols-3 gap-2">
        <Select label="Thickness" value={j.thicknessMm} onChange={(v) => set((x) => ({ ...x, thicknessMm: v }))} options={[{ v: 10, l: '10 mm' }, { v: 12, l: '12 mm' }, { v: 15, l: '15 mm' }, { v: 20, l: '20 mm' }]} />
        <Select label="Mix" value={j.mortar} onChange={(v) => set((x) => ({ ...x, mortar: v }))} options={[{ v: '1:3', l: '1 : 3' }, { v: '1:4', l: '1 : 4' }, { v: '1:5', l: '1 : 5' }, { v: '1:6', l: '1 : 6' }]} />
        <NumInput label="Waste" suffix="%" value={j.wastePct} onChange={(n) => set((x) => ({ ...x, wastePct: n }))} />
      </div>
      <Out items={[['Cement', `${f1(r.bags)} bags`], ['Plaster sand', `${f2(r.sandM3)} m³`]]} />
    </div>
  );
}

function Screed({ j, set }: { j: ScreedJob; set: Set<ScreedJob> }) {
  const r = screedResult(j);
  return (
    <div className="space-y-2.5">
      <NumInput label="Floor area" suffix="m²" value={j.areaM2} onChange={(n) => set((x) => ({ ...x, areaM2: n }))} />
      <div className="grid grid-cols-3 gap-2">
        <NumInput label="Thickness" suffix="mm" value={j.thicknessMm} onChange={(n) => set((x) => ({ ...x, thicknessMm: n }))} />
        <Select label="Mix" value={j.mortar} onChange={(v) => set((x) => ({ ...x, mortar: v }))} options={[{ v: '1:3', l: '1 : 3' }, { v: '1:4', l: '1 : 4' }]} />
        <NumInput label="Waste" suffix="%" value={j.wastePct} onChange={(n) => set((x) => ({ ...x, wastePct: n }))} />
      </div>
      <Out items={[['Cement', `${f1(r.bags)} bags`], ['Sharp sand', `${f2(r.sandM3)} m³`]]} />
    </div>
  );
}

function Concrete({ j, set }: { j: ConcreteJob; set: Set<ConcreteJob> }) {
  const r = concreteResult(j);
  return (
    <div className="space-y-2.5">
      <p className="rounded-lg bg-ochre-50 p-2 text-xs text-ochre-700">For floors on the ground, paths, blinding and kerbs. Beams, columns, slabs and foundations must use the engineer's mix and drawings, not this tool.</p>
      <div className="grid grid-cols-3 gap-2">
        <NumInput label="Length" suffix="m" value={j.lengthM} onChange={(n) => set((x) => ({ ...x, lengthM: n }))} />
        <NumInput label="Width" suffix="m" value={j.widthM} onChange={(n) => set((x) => ({ ...x, widthM: n }))} />
        <NumInput label="Depth" suffix="mm" value={round(j.depthM * 1000)} onChange={(n) => set((x) => ({ ...x, depthM: n / 1000 }))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Mix (cement : sand : granite)" value={j.mix} onChange={(v) => set((x) => ({ ...x, mix: v }))} options={[{ v: '1:3:6', l: '1 : 3 : 6 (blinding)' }, { v: '1:2:4', l: '1 : 2 : 4 (floors, paths)' }, { v: '1:1.5:3', l: '1 : 1.5 : 3 (richer)' }]} />
        <NumInput label="Waste" suffix="%" value={j.wastePct} onChange={(n) => set((x) => ({ ...x, wastePct: n }))} />
      </div>
      <Out items={[['Concrete', `${f2(r.wet)} m³`], ['Cement', `${f1(r.bags)} bags`], ['Sharp sand', `${f2(r.sandM3)} m³`], ['Granite', `${f2(r.graniteM3)} m³`]]} />
    </div>
  );
}

function Roof({ j, set }: { j: RoofJob; set: Set<RoofJob> }) {
  const r = roofResult(j);
  const stone = j.covering === 'stone';
  return (
    <div className="space-y-2.5">
      <Segmented label="Roof shape" value={j.roofType} onChange={(v) => set((x) => ({ ...x, roofType: v }))} options={[{ v: 'gable', l: 'Gable (two sides)' }, { v: 'mono', l: 'One slope' }, { v: 'hip', l: 'Hip' }]} />
      <div className="grid grid-cols-2 gap-2">
        <NumInput label="Building length" suffix="m" value={j.lengthM} onChange={(n) => set((x) => ({ ...x, lengthM: n }))} />
        <NumInput label="Building width" suffix="m" value={j.widthM} onChange={(n) => set((x) => ({ ...x, widthM: n }))} />
        <NumInput label="Overhang" suffix="m" value={j.overhangM} onChange={(n) => set((x) => ({ ...x, overhangM: n }))} />
        <NumInput label="Roof pitch" suffix="°" value={j.pitchDeg} onChange={(n) => set((x) => ({ ...x, pitchDeg: n }))} />
      </div>
      <Select label="Roof covering" value={j.covering} onChange={(v) => set((x) => ({ ...x, covering: v, wastePct: v === 'stone' ? 5 : x.wastePct }))} options={[{ v: 'longspan', l: 'Long-span aluminium sheet' }, { v: 'corrugated', l: 'Corrugated sheet' }, { v: 'stone', l: 'Stone-coated tiles' }]} />
      {stone
        ? <NumInput label="Tiles per m² (check the maker)" value={j.stonePerM2} onChange={(n) => set((x) => ({ ...x, stonePerM2: n }))} />
        : <div className="grid grid-cols-2 gap-2"><NumInput label="Cover width of one sheet" suffix="m" value={j.coverWidthM} onChange={(n) => set((x) => ({ ...x, coverWidthM: n }))} /><NumInput label="Longest sheet you can get" suffix="m" value={j.maxSheetM} onChange={(n) => set((x) => ({ ...x, maxSheetM: n }))} /></div>}
      <NumInput label="Waste and cuts" suffix="%" value={j.wastePct} onChange={(n) => set((x) => ({ ...x, wastePct: n }))} />
      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Include gutters and downpipes</p><Switch on={j.gutter} label="Include gutters" onChange={(v) => set((x) => ({ ...x, gutter: v }))} /></div>
      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Include foil insulation under the sheets</p><Switch on={j.foil} label="Include foil insulation" onChange={(v) => set((x) => ({ ...x, foil: v }))} /></div>
      <Out items={[
        ['Roof area', `${f1(r.areaM2)} m²`],
        stone ? ['Stone-coated tiles', `${r.stonePieces} pcs`] : r.sheets > 0 ? ['Sheets', `${r.sheets} × ${f2(r.sheetLenM)} m`] : ['Sheet length to order', `${f1(r.runningM)} m`],
        ['Ridge pieces (2 m)', `${r.ridgePieces}`], ['Screws', `${r.screws}`],
        ...(r.gutterPieces > 0 ? ([['Gutter (3 m)', `${r.gutterPieces}`], ['Downpipes', `${r.downpipes}`]] as [string, string][]) : []),
      ]} />
      {r.warnings.map((w, i) => <p key={i} className="rounded-lg bg-ochre-50 p-2 text-xs text-ochre-700">{w}</p>)}
    </div>
  );
}

export function JobEditor({ job, onChange }: { job: Job; onChange: (f: (j: Job) => Job) => void }) {
  // Each form edits its own job type; the cast keeps the typed forms simple.
  const set = <J extends Job>(f: (j: J) => J) => onChange(f as unknown as (j: Job) => Job);
  return (
    <Card className="border-ochre-500 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ochre-700">{KIND_LABEL[job.kind]}</p>
      {job.kind === 'tiles' && <Tiles j={job} set={set<TileJob>} />}
      {job.kind === 'blocks' && <Blocks j={job} set={set<BlockJob>} />}
      {job.kind === 'plaster' && <Plaster j={job} set={set<PlasterJob>} />}
      {job.kind === 'screed' && <Screed j={job} set={set<ScreedJob>} />}
      {job.kind === 'concrete' && <Concrete j={job} set={set<ConcreteJob>} />}
      {job.kind === 'roof' && <Roof j={job} set={set<RoofJob>} />}
    </Card>
  );
}
