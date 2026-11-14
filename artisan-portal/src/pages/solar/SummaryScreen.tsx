import React from 'react';
import type { Me } from '../../lib/api';
import { Button, Card, Field, input } from '../../lib/ui';
import { analyse, applyRecommendation, fmtKwh, fmtW, recommend, specLines, type Chem, type Design, type Goal } from '../../lib/solar';

export default function SummaryScreen({ me, design, setDesign, name, customer, flash, go }: { me: Me; design: Design; setDesign: (f: (d: Design) => Design) => void; name: string; customer: string; flash: (t: string) => void; go: (t: 'battery' | 'solar') => void }) {
  const [goalType, setGoalType] = React.useState<'hours' | 'offgrid'>('offgrid');
  const [hours, setHours] = React.useState('12');
  const [chem, setChem] = React.useState<Chem>('LITHIUM');
  const [reserve, setReserve] = React.useState(20);
  const h = Math.min(48, Math.max(1, parseFloat(hours) || 12));
  const goal: Goal = goalType === 'hours' ? { type: 'hours', hours: h } : { type: 'offgrid' };
  const a = analyse(design);
  const r = recommend(design, goal, chem, reserve);
  const lines = specLines({ ...design }, r);
  const today = new Date().toLocaleDateString('en-GB', { dateStyle: 'long' });
  const on = design.appliances.filter((x) => x.on);

  const text = [`Solar system spec${customer ? ` for ${customer}` : ''}${name ? ` (${name})` : ''}`, ...lines, '', 'Appliances:', ...on.map((x) => `- ${x.name}${x.qty > 1 ? ` x${x.qty}` : ''}: ${x.watts} W, ${x.hours} h/day`), '', `Prepared by ${me.businessName || me.name} (${me.phone}) on Estate Copilot Artisans. Estimate only; confirm on site.`].join('\n');
  async function copy() { try { await navigator.clipboard.writeText(text); flash('Copied'); } catch { flash('Could not copy'); } }

  return (
    <div className="space-y-3 pb-6">
      <Card className="p-3">
        <p className="mb-2 text-sm font-semibold">What does the customer want?</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Goal">
          {([['offgrid', 'Full 24-hour off-grid'], ['hours', 'Backup for the cut']] as const).map(([k, l]) => <button key={k} aria-pressed={goalType === k} onClick={() => setGoalType(k)} className={`min-h-[44px] rounded-xl border text-sm font-medium ${goalType === k ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'}`}>{l}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {goalType === 'hours' ? <Field label="Hours of backup"><input className={input} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
            : <Field label="Cloudy-day reserve"><select className={input} value={reserve} onChange={(e) => setReserve(Number(e.target.value))}>{[0, 20, 30, 50].map((v) => <option key={v} value={v}>+{v}%</option>)}</select></Field>}
          <Field label="Battery type"><select className={input} value={chem} onChange={(e) => setChem(e.target.value as Chem)}><option value="LITHIUM">Lithium</option><option value="LEAD_ACID">Lead-acid</option></select></Field>
        </div>
      </Card>

      <Card className="border-moss-600 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss-700">Recommended</p>
        <dl className="mt-2 space-y-2.5">
          <div className="flex items-baseline justify-between"><dt className="text-sm text-[#42504a]">Inverter</dt><dd className="text-lg font-extrabold">{r.inverterKva} kVA <span className="text-xs font-medium text-[#6d7a73]">({fmtW(r.inverterW)} · {r.systemV}V)</span></dd></div>
          <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-[#42504a]">Batteries</dt><dd className="text-right text-lg font-extrabold">{r.qty} × {r.unit.label.split(' (')[0]}<span className="block text-xs font-medium text-[#6d7a73]">{fmtKwh(r.nominalWh)} stored, {fmtKwh(r.usableWh)} usable</span></dd></div>
          <div className="flex items-baseline justify-between"><dt className="text-sm text-[#42504a]">Solar panels</dt><dd className="text-lg font-extrabold">{r.panels} × {r.panelWatts} W <span className="text-xs font-medium text-[#6d7a73]">({fmtW(r.panels * r.panelWatts)})</span></dd></div>
        </dl>
        {r.moreThanFour && <p className="mt-3 rounded-lg bg-ochre-50 p-2 text-sm text-ochre-700">That is more than 4 batteries. Think about shedding the heaviest loads, or two separate banks.</p>}
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-[#6d7a73]">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button disabled={a.peakW === 0} onClick={() => { setDesign((d) => applyRecommendation(d, r)); flash('Applied. See it on the Battery and Solar tabs'); }}>Use these</Button>
          <Button variant="ghost" onClick={() => go('solar')}>See the 24 hours</Button>
        </div>
      </Card>

      <div id="spec-print" className="rounded-2xl border border-black/10 bg-white p-4">
        <p className="text-lg font-extrabold">Solar system specification</p>
        <p className="text-xs text-[#6d7a73]">{[customer, name, today].filter(Boolean).join(' · ')}</p>
        <ul className="mt-3 space-y-1.5 text-sm">{lines.map((l, i) => <li key={i}>• {l}</li>)}</ul>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Appliances covered</p>
        <table className="mt-1 w-full text-xs"><tbody>{on.map((x) => <tr key={x.id} className="border-t border-black/10"><td className="py-1">{x.name}{x.qty > 1 ? ` × ${x.qty}` : ''}</td><td className="py-1 text-right">{fmtW(x.watts)}</td><td className="py-1 text-right">{x.hours} h</td></tr>)}</tbody></table>
        <p className="mt-3 text-[11px] leading-snug text-[#6d7a73]">Prepared by {me.businessName || me.name} · {me.phone}. This is a sizing estimate based on typical ratings and {a.psh} peak sun hours. Confirm cable sizes, protection, inverter and battery compatibility and the site survey before buying. Installation must follow the manufacturers' instructions and the applicable electrical regulations.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="ghost" onClick={() => window.print()}>Print / PDF</Button>
        <a className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-2 py-3 text-sm font-semibold text-white" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <Button variant="ghost" onClick={() => void copy()}>Copy</Button>
      </div>
    </div>
  );
}
