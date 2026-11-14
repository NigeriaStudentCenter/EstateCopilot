import { Card } from '../../lib/ui';
import { NumInput, Select, Segmented } from '../tools/parts';
import {
  EQUIPMENT_PRESETS, FIT_TEXT, GLASS, ROOF, SHADE, SIZES, USE, WALL_LABEL, LIGHT_W_PER_M2, analyseRoom, round,
  type Ctx, type GlassKind, type RoofKind, type Room, type ShadeKind, type Side, type UseKind, type WallKind,
} from '../../lib/hvac';

const SIDES: { s: Side; l: string }[] = [{ s: 'N', l: 'North' }, { s: 'E', l: 'East' }, { s: 'S', l: 'South' }, { s: 'W', l: 'West' }];
const opts = <K extends string>(o: Record<K, { label: string }>) => (Object.keys(o) as K[]).map((k) => ({ v: k, l: o[k].label }));
const COLORS = ['#b4530e', '#e8a33d', '#0a7d3b', '#3b6ea5', '#8a6bb0', '#6d7a73', '#c0392b'];

export function ResultCard({ room, ctx }: { room: Room; ctx: Ctx }) {
  const res = analyseRoom(room, ctx);
  const tot = res.subtotalW || 1;
  const fitTone = res.fit === 'GOOD' ? 'bg-moss-600/10 text-moss-700' : res.fit === 'NONE' ? '' : 'bg-red-50 text-red-800';
  return (
    <Card className="p-4" >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6d7a73]">This room needs</p>
      <p className="text-3xl font-extrabold leading-tight">{round(res.btu, -2).toLocaleString('en')} <span className="text-base font-semibold text-[#6d7a73]">BTU/h</span></p>
      <div className="mt-2 rounded-xl bg-moss-600/10 p-3 text-moss-700" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide">Fit</p>
        <p className="text-lg font-extrabold">{res.sizing.units > 1 ? `${res.sizing.units} × ` : ''}{res.sizing.perUnitBtu.toLocaleString('en')} BTU <span className="text-sm font-semibold">({res.sizing.hp}) {room.acType === 'INVERTER' ? 'inverter' : 'fixed-speed'} split</span></p>
        {res.sizing.units > 1 && <p className="text-xs">Two or more units cool a big room more evenly than one.</p>}
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-black/5" role="img" aria-label="Where the heat comes from">
        {res.parts.map((p, i) => p.w > 0 && <div key={p.key} style={{ width: `${(p.w / tot) * 100}%`, background: COLORS[i % COLORS.length] }} />)}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#42504a]">
        {res.parts.map((p, i) => <li key={p.key} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><i className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} /><span className="truncate">{p.label}</span></span><b>{round((p.w / tot) * 100)}%</b></li>)}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-black/5 p-3 text-xs">
        <div><p className="text-[#6d7a73]">Draws about</p><p className="text-sm font-bold">{round(res.electrical.runningW)} W · {round(res.electrical.amps, 1)} A</p></div>
        <div><p className="text-[#6d7a73]">Breaker and cable</p><p className="text-sm font-bold">{res.electrical.breakerA} A · {res.electrical.cableMm2} mm²</p></div>
        <div><p className="text-[#6d7a73]">Energy a day</p><p className="text-sm font-bold">{round(res.electrical.kwhPerDay, 1)} kWh ({room.hoursPerDay} h)</p></div>
        <div><p className="text-[#6d7a73]">Start-up surge</p><p className="text-sm font-bold">{round(res.electrical.surgeW)} W</p></div>
      </div>
      <p className="mt-1.5 text-[11px] text-[#8a948d]">Typical figures per unit. Use the nameplate and the wiring regulations for the real breaker and cable.</p>
      {res.fit !== 'NONE' && <p className={`mt-2 rounded-lg p-2 text-sm font-semibold ${fitTone}`}>{room.chosenBtu?.toLocaleString('en')} BTU: {FIT_TEXT[res.fit]}</p>}
      {res.warnings.map((w, i) => <p key={i} className="mt-2 rounded-lg bg-ochre-50 p-2 text-xs text-ochre-700">{w}</p>)}
    </Card>
  );
}

export function RoomEditor({ room, ctx, onChange }: { room: Room; ctx: Ctx; onChange: (f: (r: Room) => Room) => void }) {
  const area = room.lengthM * room.widthM;
  const setSide = (key: 'walls' | 'windows', s: Side, n: number) => onChange((r) => ({ ...r, [key]: { ...r[key], [s]: n } }));
  return (
    <div className="space-y-3">
      <ResultCard room={room} ctx={ctx} />
      <Card className="space-y-2.5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">The room</p>
        <Select label="What is it used for" value={room.use} options={opts(USE)} onChange={(v: UseKind) => onChange((r) => ({ ...r, use: v, people: USE[v].people }))} />
        <div className="grid grid-cols-3 gap-2">
          <NumInput label="Length" suffix="m" value={room.lengthM} onChange={(n) => onChange((r) => ({ ...r, lengthM: n }))} />
          <NumInput label="Width" suffix="m" value={room.widthM} onChange={(n) => onChange((r) => ({ ...r, widthM: n }))} />
          <NumInput label="Height" suffix="m" value={room.heightM} onChange={(n) => onChange((r) => ({ ...r, heightM: n }))} />
        </div>
        <Select label="Above the room" value={room.roof} options={opts(ROOF)} onChange={(v: RoofKind) => onChange((r) => ({ ...r, roof: v }))} />
        <Select label="Outside walls are" value={room.wallKind} options={(Object.keys(WALL_LABEL) as WallKind[]).map((k) => ({ v: k, l: WALL_LABEL[k] }))} onChange={(v: WallKind) => onChange((r) => ({ ...r, wallKind: v }))} />
      </Card>

      <Card className="p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Outside walls and windows, by the way they face</p>
        <p className="mb-2 text-xs text-[#8a948d]">Enter the length of outside wall facing each direction, and the window area in it. Leave a side at 0 if there is no outside wall there. West walls and windows add the most heat.</p>
        <div className="grid grid-cols-[3.2rem_1fr_1fr] items-end gap-2">
          <span /><span className="text-[11px] font-semibold uppercase text-[#6d7a73]">Wall (m)</span><span className="text-[11px] font-semibold uppercase text-[#6d7a73]">Windows (m²)</span>
          {SIDES.map(({ s, l }) => (
            <div key={s} className="contents">
              <span className="pb-3 text-sm font-semibold">{l}</span>
              <NumInput label={`${l} wall length`} value={room.walls[s]} onChange={(n) => setSide('walls', s, n)} className="[&>span]:sr-only" />
              <NumInput label={`${l} window area`} value={room.windows[s]} onChange={(n) => setSide('windows', s, n)} className="[&>span]:sr-only" />
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Select label="Glass" value={room.glass} options={opts(GLASS)} onChange={(v: GlassKind) => onChange((r) => ({ ...r, glass: v }))} />
          <Select label="Shading" value={room.shade} options={opts(SHADE)} onChange={(v: ShadeKind) => onChange((r) => ({ ...r, shade: v }))} />
        </div>
      </Card>

      <Card className="space-y-2.5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Inside the room</p>
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="People" value={room.people} onChange={(n) => onChange((r) => ({ ...r, people: n }))} />
          <NumInput label="Lighting" suffix="W" value={room.lightingW} onChange={(n) => onChange((r) => ({ ...r, lightingW: n }))} />
        </div>
        <button type="button" className="text-xs font-semibold text-ochre-700 underline" onClick={() => onChange((r) => ({ ...r, lightingW: Math.round(area * LIGHT_W_PER_M2) }))}>Estimate lighting from the floor area ({Math.round(area * LIGHT_W_PER_M2)} W)</button>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Equipment that gives off heat</p>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT_PRESETS.map((p) => <button key={p.name} type="button" onClick={() => onChange((r) => (r.equipment.length >= 20 ? r : { ...r, equipment: [...r.equipment, { name: p.name, watts: p.watts, qty: 1 }] }))} className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium text-[#42504a] active:bg-black/5">+ {p.name}</button>)}
          </div>
          {room.equipment.map((e, i) => (
            <div key={i} className="mt-2 grid grid-cols-[1fr_4.5rem_3.5rem_auto] items-end gap-2">
              <span className="truncate pb-3 text-sm">{e.name}</span>
              <NumInput label={`${e.name} watts`} suffix="W" value={e.watts} onChange={(n) => onChange((r) => ({ ...r, equipment: r.equipment.map((x, j) => (j === i ? { ...x, watts: n } : x)) }))} className="[&>span]:sr-only" />
              <NumInput label={`${e.name} quantity`} value={e.qty} onChange={(n) => onChange((r) => ({ ...r, equipment: r.equipment.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Math.round(n)) } : x)) }))} className="[&>span]:sr-only" />
              <button type="button" aria-label={`Remove ${e.name}`} className="pb-3 text-lg text-[#8a948d]" onClick={() => onChange((r) => ({ ...r, equipment: r.equipment.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-2.5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">The air conditioner</p>
        <Segmented label="AC type" value={room.acType} onChange={(v) => onChange((r) => ({ ...r, acType: v }))} options={[{ v: 'INVERTER', l: 'Inverter' }, { v: 'FIXED', l: 'Fixed-speed' }]} />
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="Hours it runs a day" suffix="h" value={room.hoursPerDay} onChange={(n) => onChange((r) => ({ ...r, hoursPerDay: n }))} />
          <Select label="Compare with a size" value={room.chosenBtu ?? 0} options={[{ v: 0, l: 'None' }, ...SIZES.map((s) => ({ v: s.btu, l: `${s.btu.toLocaleString('en')} (${s.hp})` }))]} onChange={(v: number) => onChange((r) => ({ ...r, chosenBtu: v || null }))} />
        </div>
      </Card>
    </div>
  );
}
