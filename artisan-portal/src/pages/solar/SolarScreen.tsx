import { Card, Field, input } from '../../lib/ui';
import { PANEL_WATTS, PSH, REGIONS, analyse, fmtKwh, fmtW, round, simulateDay, type Design } from '../../lib/solar';
import { Switch } from './LoadScreen';

const VERDICT: Record<ReturnType<typeof analyse>['verdict'], { tone: string; title: string; body: (a: ReturnType<typeof analyse>) => string }> = {
  NO_LOAD: { tone: 'bg-black/5 text-[#42504a]', title: 'Add some appliances first', body: () => 'Switch appliances on in the Load tab to see how this system performs.' },
  SUSTAINABLE: { tone: 'bg-moss-600/10 text-moss-700', title: '✓ Runs 24 hours without grid or generator', body: (a) => `The sun covers the daytime loads and refills the battery in about ${round(a.chargeHours ?? 0, 1)} sun-hours (you get ${a.psh}).` },
  BATTERY_SHORT: { tone: 'bg-red-50 text-red-800', title: 'Battery runs flat before morning', body: (a) => `It lasts about ${round(a.nightCoverHours ?? 0, 1)} of the 12 night hours. Add batteries or switch off night loads.` },
  SOLAR_SHORT: { tone: 'bg-red-50 text-red-800', title: 'Panels cannot refill the battery every day', body: (a) => `You are about ${fmtKwh(Math.max(0, a.refillWh - a.surplusWh))} a day short. Add panels or switch off daytime loads.` },
  BOTH_SHORT: { tone: 'bg-red-50 text-red-800', title: 'Not enough battery or solar', body: () => 'The battery runs out before morning and the panels cannot refill it. See the numbers below.' },
};

function Chart({ design }: { design: Design }) {
  const sim = simulateDay(design);
  const W = 320, H = 130, pad = 18;
  const maxP = Math.max(1, ...sim.map((p) => Math.max(p.genW, p.loadW)));
  const x = (h: number) => pad + ((W - pad * 2) * h) / 24;
  const bw = (W - pad * 2) / 24 - 1;
  const soc = sim.map((p, i) => `${x(i + 0.5)},${H - 16 - (p.socPct / 100) * (H - 40)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="24 hour chart of solar generation, load and battery charge">
      <rect x={x(6)} y={4} width={x(18) - x(6)} height={H - 20} fill="#f6ddc4" opacity="0.35" />
      {sim.map((p, i) => <rect key={`g${i}`} x={x(i)} width={bw} y={H - 16 - (p.genW / maxP) * (H - 40)} height={(p.genW / maxP) * (H - 40)} fill="#e8a33d" opacity="0.85" />)}
      {sim.map((p, i) => <rect key={`l${i}`} x={x(i) + bw * 0.3} width={bw * 0.4} y={H - 16 - (p.loadW / maxP) * (H - 40)} height={(p.loadW / maxP) * (H - 40)} fill="#16241d" opacity="0.7" />)}
      <polyline points={soc} fill="none" stroke="#0a7d3b" strokeWidth="2.5" strokeLinejoin="round" />
      {[0, 6, 12, 18, 24].map((h) => <text key={h} x={x(h)} y={H - 3} fontSize="9" textAnchor="middle" fill="#6d7a73">{h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`}</text>)}
    </svg>
  );
}

export default function SolarScreen({ design, setDesign }: { design: Design; setDesign: (f: (d: Design) => Design) => void }) {
  const a = analyse(design);
  const v = VERDICT[a.verdict];
  const setPanels = (n: number) => setDesign((d) => ({ ...d, panels: Math.min(200, Math.max(0, n)) }));
  return (
    <div className="space-y-3 pb-6">
      <Card className="p-3">
        <Field label="Panel size">
          <div className="grid grid-cols-3 gap-2">{PANEL_WATTS.map((w) => <button key={w} aria-pressed={design.panelWatts === w} onClick={() => setDesign((d) => ({ ...d, panelWatts: w }))} className={`min-h-[44px] rounded-xl border text-sm font-medium ${design.panelWatts === w ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'}`}>{w} W</button>)}</div>
        </Field>
        <div className="mt-3 flex items-center justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Number of panels</p><p className="text-xs text-[#6d7a73]">{fmtW(a.arrayW)} of solar</p></div>
          <div className="flex items-center gap-3">
            <button aria-label="Fewer panels" onClick={() => setPanels(design.panels - 1)} className="h-11 w-11 rounded-xl border border-black/15 text-xl">−</button>
            <span className="w-8 text-center text-2xl font-extrabold">{design.panels}</span>
            <button aria-label="More panels" onClick={() => setPanels(design.panels + 1)} className="h-11 w-11 rounded-xl border border-black/15 text-xl">+</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Where"><select className={input} value={design.region} onChange={(e) => setDesign((d) => ({ ...d, region: e.target.value, pshOverride: null }))}>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          <Field label="Sun hours" hint={`Typical for ${design.region}: ${PSH[design.region] ?? 4.8}`}><input className={input} inputMode="decimal" value={design.pshOverride ?? ''} placeholder={String(PSH[design.region] ?? 4.8)} onChange={(e) => { const n = parseFloat(e.target.value); setDesign((d) => ({ ...d, pshOverride: Number.isFinite(n) && n >= 1 && n <= 8 ? n : null })); }} /></Field>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold">Plan for the rainy season</p><p className="text-xs text-[#6d7a73]">Takes 20% off the sun. Safer for a house that must never run out.</p></div>
          <Switch on={design.conservative} label="Plan for the rainy season" onChange={(v2) => setDesign((d) => ({ ...d, conservative: v2 }))} />
        </div>
      </Card>

      <Card className={`p-4 ${v.tone}`} aria-live="polite"><p className="font-bold">{v.title}</p><p className="mt-1 text-sm">{v.body(a)}</p></Card>

      <Card className="p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Your 24 hours</p>
        <Chart design={design} />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#42504a]">
          <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#e8a33d]" />Solar</span>
          <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#16241d]/70" />Your load</span>
          <span><i className="mr-1 inline-block h-0.5 w-3 bg-moss-600 align-middle" />Battery charge</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#6d7a73]">☀️ Daytime 06–18</p><p className="mt-1 text-sm">Solar makes <b>{fmtKwh(a.harvestWh)}</b></p><p className="text-sm">Loads use <b>{fmtKwh(a.daytimeDcWh)}</b></p><p className="text-sm">Left for battery <b>{fmtKwh(Math.max(0, a.surplusWh))}</b></p></Card>
        <Card className="p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#6d7a73]">🌙 Night 18–06</p><p className="mt-1 text-sm">Loads need <b>{fmtKwh(a.nightWh / design.invEff)}</b></p><p className="text-sm">Battery holds <b>{fmtKwh(a.usableWh)}</b></p><p className="text-sm">{a.nightGapAcWh > 1 ? <>Gap <b className="text-red-700">{fmtKwh(a.nightGapAcWh)}</b> nightly</> : <b className="text-moss-700">No gap</b>}</p></Card>
      </div>
      {a.chargeHours !== null && <p className="text-center text-xs text-[#6d7a73]">Refill from empty takes about {round(a.chargeHours, 1)} sun-hours with the daytime loads running · {a.psh} sun-hours available.</p>}
      {a.warnings.filter((w) => w.level !== 'info').map((w, i) => <p key={i} className="rounded-xl bg-ochre-50 p-3 text-sm text-ochre-700">{w.text}</p>)}
    </div>
  );
}
