import React from 'react';
import { api, ApiError } from '../../lib/api';
import { compressImage } from '../../lib/compressImage';
import { Button, Card, Field, input } from '../../lib/ui';
import { PRESETS, analyse, energy, guessFromName, fmtKwh, fmtW, maxHours, round, type Appliance, type Design, type When } from '../../lib/solar';
import { uid } from './store';

const DUTY = [{ l: 'Always on', v: 1 }, { l: 'AC / iron ~60%', v: 0.6 }, { l: 'Fridge ~40%', v: 0.4 }];
const SURGE = [{ l: 'No', v: 1 }, { l: 'Small motor (fan)', v: 1.5 }, { l: 'Fridge / AC / pump', v: 4 }, { l: 'Big motor', v: 6 }];
const WHEN: { v: When; l: string }[] = [{ v: 'DAY', l: 'Daytime' }, { v: 'NIGHT', l: 'Night' }, { v: 'ALL', l: 'All day' }];

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  // The button is the 44px tap target; the visible track is drawn inside it (the app gives every button a minimum height).
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative h-11 w-14 shrink-0">
      <span className={`absolute left-1 top-1/2 h-7 w-12 -translate-y-1/2 rounded-full transition ${on ? 'bg-moss-600' : 'bg-black/25'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

interface Draft { id: string; name: string; qty: string; watts: string; hours: string; duty: number; when: When; surge: number; note?: string | null; editing: boolean; on: boolean }
const toDraft = (a: Appliance, editing: boolean, note?: string | null): Draft => ({ id: a.id, name: a.name, qty: String(a.qty), watts: String(a.watts || ''), hours: String(a.hours), duty: a.duty, when: a.when, surge: a.surge, note, editing, on: a.on });

export default function LoadScreen({ design, setDesign, flash }: { design: Design; setDesign: (f: (d: Design) => Design) => void; flash: (t: string) => void }) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const a = analyse(design);

  function blank(name = ''): Draft {
    const g = name ? guessFromName(name) : { duty: 1, surge: 1, when: 'ALL' as When, hours: 4 };
    return { id: uid(), name, qty: '1', watts: '', hours: String(g.hours), duty: g.duty, when: g.when, surge: g.surge, editing: false, on: true };
  }
  function fromPreset(p: (typeof PRESETS)[number]) {
    setDraft({ id: uid(), name: p.name, qty: '1', watts: String(p.watts), hours: String(p.hours), duty: p.duty, when: p.when, surge: p.surge, editing: false, on: true });
  }
  async function scan(f: File | undefined) {
    if (!f) return;
    setScanning(true);
    try {
      const r = await api.scanLabel(await compressImage(f));
      const g = guessFromName(r.name ?? '');
      if (!r.readable || !r.watts) { setDraft({ ...blank(r.name ?? ''), note: r.note || "We couldn't read the watts on that label. Type them in from the sticker." }); flash('Could not read the label'); }
      else setDraft({ ...blank(r.name ?? 'Appliance'), watts: String(r.watts), duty: g.duty, surge: g.surge, when: g.when, hours: String(g.hours), note: ['Check this against the sticker before you add it.', r.note].filter(Boolean).join(' ') });
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'Could not scan the label');
    } finally { setScanning(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  function commit() {
    if (!draft) return;
    const watts = parseFloat(draft.watts), qty = Math.round(parseFloat(draft.qty)), hours = parseFloat(draft.hours);
    if (!draft.name.trim()) return flash('Give the appliance a name');
    if (!(watts > 0 && watts <= 20000)) return flash('Enter the watts from the label (1 to 20,000)');
    if (!(qty >= 1 && qty <= 99)) return flash('How many of them? (1 to 99)');
    if (!(hours >= 0 && hours <= maxHours(draft.when))) return flash(`Hours must be 0 to ${maxHours(draft.when)} for "${WHEN.find((w) => w.v === draft.when)!.l}"`);
    const item: Appliance = { id: draft.id, name: draft.name.trim().slice(0, 40), qty, watts, hours, duty: draft.duty, when: draft.when, surge: draft.surge, on: draft.on };
    setDesign((d) => ({ ...d, appliances: draft.editing ? d.appliances.map((x) => (x.id === item.id ? item : x)) : [...d.appliances, item] }));
    setDraft(null);
  }

  return (
    <div className="pb-28">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void scan(e.target.files?.[0])} />
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={scanning} onClick={() => fileRef.current?.click()}>{scanning ? 'Reading label…' : '📷 Scan label'}</Button>
        <Button variant="ghost" onClick={() => setDraft(blank())}>+ Add by hand</Button>
      </div>
      <p className="mt-1 text-xs text-[#6d7a73]">Photograph the sticker on the back of the appliance. We read the watts for you (or work them out from volts × amps).</p>

      {draft && (
        <Card className="mt-3 border-ochre-500 p-3">
          <p className="mb-2 text-sm font-semibold">{draft.editing ? 'Edit appliance' : 'New appliance'}</p>
          {draft.note && <p className="mb-2 rounded-lg bg-ochre-50 p-2 text-xs text-ochre-700">{draft.note}</p>}
          <div className="space-y-2.5">
            <Field label="Name"><input className={input} value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Living room TV" /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Watts"><input className={input} inputMode="decimal" value={draft.watts} onChange={(e) => setDraft({ ...draft, watts: e.target.value })} placeholder="150" /></Field>
              <Field label="How many"><input className={input} inputMode="numeric" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} /></Field>
              <Field label="Hours/day"><input className={input} inputMode="decimal" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} /></Field>
            </div>
            <Field label="Used when">
              <div className="grid grid-cols-3 gap-2">{WHEN.map((w) => <button key={w.v} type="button" aria-pressed={draft.when === w.v} onClick={() => setDraft({ ...draft, when: w.v })} className={`min-h-[44px] rounded-xl border text-sm font-medium ${draft.when === w.v ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'}`}>{w.l}</button>)}</div>
            </Field>
            <Field label="Draws full power" hint="Fridges and ACs cycle on and off, so they use less than the label over a day.">
              <div className="grid grid-cols-3 gap-2">{DUTY.map((x) => <button key={x.v} type="button" aria-pressed={draft.duty === x.v} onClick={() => setDraft({ ...draft, duty: x.v })} className={`min-h-[44px] rounded-xl border px-1 text-xs font-medium ${draft.duty === x.v ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'}`}>{x.l}</button>)}</div>
            </Field>
            <Field label="Starts a motor?" hint="Motors pull 3 to 6 times their rating for a moment at start-up. This sizes the inverter.">
              <select className={input} value={draft.surge} onChange={(e) => setDraft({ ...draft, surge: Number(e.target.value) })}>{SURGE.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button><Button onClick={commit}>{draft.editing ? 'Save' : 'Add to list'}</Button></div>
        </Card>
      )}

      {!draft && design.appliances.length < 60 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Quick add</p>
          <div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.name} onClick={() => fromPreset(p)} className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium text-[#42504a] active:bg-black/5">{p.name}</button>)}</div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {design.appliances.length === 0 && <Card className="p-4 text-center text-sm text-[#6d7a73]">No appliances yet. Scan a label or tap a quick-add above.</Card>}
        {design.appliances.map((x) => {
          const e = energy(x);
          return (
            <Card key={x.id} className={`p-3 ${x.on ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{x.name}{x.qty > 1 ? ` × ${x.qty}` : ''}</p>
                  <p className="text-xs text-[#6d7a73]">{fmtW(x.watts)} · {x.hours} h/day · {Math.round(x.duty * 100)}% duty · {WHEN.find((w) => w.v === x.when)!.l.toLowerCase()}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#16241d]">{round((e.dayWh + e.nightWh) / 1000, 2)} kWh/day</p>
                </div>
                <Switch on={x.on} label={`${x.name} on`} onChange={(v) => setDesign((d) => ({ ...d, appliances: d.appliances.map((y) => (y.id === x.id ? { ...y, on: v } : y)) }))} />
              </div>
              <div className="mt-2 flex gap-4 text-xs font-semibold">
                <button className="text-ochre-700 underline" onClick={() => setDraft(toDraft(x, true))}>Edit</button>
                <button className="text-[#8a948d] underline" onClick={() => setDesign((d) => ({ ...d, appliances: d.appliances.filter((y) => y.id !== x.id) }))}>Remove</button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-md px-3">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#16241d] p-3 text-white shadow-lg" aria-live="polite">
          <div><p className="text-[10px] uppercase tracking-wide text-white/60">Peak load</p><p className="text-lg font-extrabold">{fmtW(a.peakW)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-white/60">Daily need</p><p className="text-lg font-extrabold">{fmtKwh(a.dailyWh)}</p></div>
        </div>
      </div>
    </div>
  );
}
