import { Card, Field, input } from '../../lib/ui';
import { BATTERY_UNITS, DOD, analyse, batteryUnit, fmtHM, fmtKwh, fmtW, maxHours, round, type Chem, type Design } from '../../lib/solar';
import { Switch } from './LoadScreen';

function Gauge({ hours }: { hours: number | null }) {
  const pct = hours === null ? 0 : Math.min(1, hours / 24);
  const r = 70, c = 2 * Math.PI * r;
  const col = hours === null ? '#9aa39e' : hours >= 12 ? '#0a7d3b' : hours >= 6 ? '#b4530e' : '#b3261e';
  return (
    <div className="relative mx-auto h-44 w-44" role="img" aria-label={`Estimated runtime ${fmtHM(hours)}`}>
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="#0000001a" strokeWidth="14" />
        <circle cx="90" cy="90" r={r} fill="none" stroke={col} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .35s' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[#6d7a73]">Runs for</p><p className="text-xl font-extrabold leading-tight" style={{ color: col }}>{fmtHM(hours)}</p></div>
      </div>
    </div>
  );
}

export default function BatteryScreen({ design, setDesign }: { design: Design; setDesign: (f: (d: Design) => Design) => void }) {
  const a = analyse(design);
  const unit = batteryUnit(design);
  const chem: Chem = unit.chem;
  const inChem = BATTERY_UNITS.filter((u) => u.chem === chem);
  const setChem = (c: Chem) => setDesign((d) => ({ ...d, unitId: BATTERY_UNITS.find((u) => u.chem === c)!.id }));
  const setQty = (q: number) => setDesign((d) => ({ ...d, batteryQty: Math.min(40, Math.max(1, q)) }));
  return (
    <div className="space-y-3 pb-24">
      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Battery type">
          {([['LITHIUM', 'Lithium (LiFePO4)'], ['LEAD_ACID', 'Lead-acid / tubular']] as const).map(([k, l]) => (
            <button key={k} aria-pressed={chem === k} onClick={() => setChem(k)} className={`min-h-[44px] rounded-xl border text-sm font-medium ${chem === k ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'}`}>{l}</button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[#6d7a73]">Only {round(DOD[chem] * 100)}% of a {chem === 'LITHIUM' ? 'lithium' : 'lead-acid'} battery is safe to use each day.</p>
        <div className="mt-3"><Field label="Battery size">
          <select className={input} value={design.unitId === 'custom' ? 'custom' : unit.id} onChange={(e) => setDesign((d) => ({ ...d, unitId: e.target.value, custom: e.target.value === 'custom' ? { ...d.custom, chem } : d.custom }))}>
            {inChem.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            <option value="custom">Other size…</option>
          </select></Field></div>
        {design.unitId === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Volts"><input className={input} inputMode="decimal" value={design.custom.volts} onChange={(e) => setDesign((d) => ({ ...d, custom: { ...d.custom, volts: Number(e.target.value) || 0 } }))} /></Field>
            <Field label="Amp-hours"><input className={input} inputMode="decimal" value={design.custom.ah} onChange={(e) => setDesign((d) => ({ ...d, custom: { ...d.custom, ah: Number(e.target.value) || 0 } }))} /></Field>
          </div>
        )}
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">How many batteries</p>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Number of batteries">
            {[1, 2, 3, 4].map((q) => <button key={q} aria-pressed={design.batteryQty === q} onClick={() => setQty(q)} className={`min-h-[44px] rounded-xl border text-base font-bold ${design.batteryQty === q ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'}`}>{q}</button>)}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl border border-black/10 px-3">
            <span className="text-xs text-[#6d7a73]">Need more than 4?</span>
            <div className="flex items-center gap-2">
              <button aria-label="Fewer batteries" onClick={() => setQty(design.batteryQty - 1)} className="h-11 w-10 text-xl">−</button>
              <span className="w-6 text-center text-base font-bold">{design.batteryQty}</span>
              <button aria-label="More batteries" onClick={() => setQty(design.batteryQty + 1)} className="h-11 w-10 text-xl">+</button>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-[#6d7a73]">{a.qty} × {unit.label.split(' (')[0]} = {fmtKwh(a.nominalWh)} stored · <b>{fmtKwh(a.usableWh)} usable</b> · {a.systemV}V system{a.seriesFactor > 1 ? `, ${a.seriesFactor} in series per string` : ''}</p>
        </div>
      </Card>

      <Card className="p-4">
        <Gauge hours={a.runtimeH} />
        <p className="mt-2 text-center text-sm text-[#42504a]">Running now: <b>{fmtW(a.avgRunW)}</b> on average{a.peakW > a.avgRunW ? <> · all at once <b>{fmtW(a.peakW)}</b> (would last {fmtHM(a.runtimePeakH)})</> : null}</p>
        <p className="mt-1 text-center text-xs text-[#6d7a73]">With {round(design.invEff * 100)}% inverter efficiency, no sun, from a full battery.</p>
      </Card>

      {a.warnings.filter((w) => w.level !== 'info').map((w, i) => (
        <p key={i} role={w.level === 'bad' ? 'alert' : undefined} className={`rounded-xl p-3 text-sm ${w.level === 'bad' ? 'bg-red-50 text-red-800' : 'bg-ochre-50 text-ochre-700'}`}>{w.text}</p>
      ))}

      <div>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Load shedding: switch things off and watch the time go up</h2>
        {design.appliances.length === 0 && <Card className="p-4 text-sm text-[#6d7a73]">Add appliances on the Load tab first.</Card>}
        <div className="space-y-2">
          {design.appliances.map((x) => (
            <Card key={x.id} className={`p-3 ${x.on ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{x.name}{x.qty > 1 ? ` × ${x.qty}` : ''}</p><p className="text-xs text-[#6d7a73]">{fmtW(x.watts * x.qty * x.duty)} while running</p></div>
                <Switch on={x.on} label={`${x.name} on`} onChange={(v) => setDesign((d) => ({ ...d, appliances: d.appliances.map((y) => (y.id === x.id ? { ...y, on: v } : y)) }))} />
              </div>
              {x.on && (
                <label className="mt-2 flex items-center gap-3 text-xs text-[#42504a]">
                  <span className="w-16 shrink-0">{x.hours} h/day</span>
                  <input type="range" min={0} max={maxHours(x.when)} step={0.5} value={Math.min(x.hours, maxHours(x.when))} className="w-full accent-[#b4530e]" aria-label={`${x.name} hours per day`}
                    onChange={(e) => setDesign((d) => ({ ...d, appliances: d.appliances.map((y) => (y.id === x.id ? { ...y, hours: Number(e.target.value) } : y)) }))} />
                </label>
              )}
            </Card>
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-md px-3">
        <div className="flex items-center justify-between rounded-2xl bg-[#16241d] px-4 py-3 text-white shadow-lg" aria-live="polite">
          <div><p className="text-[10px] uppercase tracking-wide text-white/60">Runs for</p><p className="text-lg font-extrabold">{fmtHM(a.runtimeH)}</p></div>
          <div className="text-right"><p className="text-[10px] uppercase tracking-wide text-white/60">Load now</p><p className="text-lg font-extrabold">{fmtW(a.avgRunW)}</p></div>
        </div>
      </div>
    </div>
  );
}
