import React from 'react';
import { Card, input } from '../../lib/ui';
import type { Proj } from './useProjects';

// A number box that lets you type "0." or clear it while editing, and only reports real numbers.
export function NumInput({ value, onChange, label, suffix, step = 'any', min, className = '' }: { value: number; onChange: (n: number) => void; label: string; suffix?: string; step?: string; min?: number; className?: string }) {
  const [s, setS] = React.useState(String(value));
  React.useEffect(() => { if (parseFloat(s) !== value && !(s === '' && value === 0)) setS(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">{label}</span>
      <div className="relative">
        <input className={input + (suffix ? ' !pr-12' : '')} inputMode="decimal" step={step} min={min} value={s} aria-label={label}
          onChange={(e) => { setS(e.target.value); const n = parseFloat(e.target.value.replace(/,/g, '')); if (Number.isFinite(n)) onChange(n); else if (e.target.value.trim() === '') onChange(0); }} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8a948d]">{suffix}</span>}
      </div>
    </label>
  );
}

export function Select<V extends string | number>({ label, value, onChange, options, className = '' }: { label: string; value: V; onChange: (v: V) => void; options: { v: V; l: string }[]; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">{label}</span>
      <select className={input} aria-label={label} value={String(value)} onChange={(e) => { const o = options.find((x) => String(x.v) === e.target.value); if (o) onChange(o.v); }}>
        {options.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
      </select>
    </label>
  );
}

export function Segmented<V extends string>({ value, onChange, options, label }: { value: V; onChange: (v: V) => void; options: { v: V; l: string }[]; label: string }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="group" aria-label={label}>
      {options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)} className={`min-h-[40px] rounded-lg px-1 text-xs font-semibold ${value === o.v ? 'bg-ochre-500 text-white' : 'bg-black/5 text-[#42504a]'}`}>{o.l}</button>)}
    </div>
  );
}

// Saved projects: pick, add, name, delete. Same look as the solar tool.
export function ProjectBar<T>({ projects, project, setActiveId, patch, add, remove, flash, noun = 'project' }: { projects: Proj<T>[]; project: Proj<T>; setActiveId: (id: string) => void; patch: (o: { name?: string; customer?: string }) => void; add: () => boolean; remove: () => void; flash: (t: string) => void; noun?: string }) {
  return (
    <Card className="mb-3 p-3">
      <div className="flex gap-2">
        <select className={input + ' !py-2'} aria-label={`Saved ${noun}`} value={project.id} onChange={(e) => setActiveId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.customer ? `${p.customer} · ` : ''}{p.name}</option>)}
        </select>
        <button onClick={() => { if (!add()) flash(`You can keep 30 ${noun}s. Delete an old one first.`); }} className="shrink-0 rounded-xl border border-black/15 px-3 text-sm font-semibold text-ochre-700">+ New</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input className={input + ' !py-2 !text-sm'} aria-label="Customer name" placeholder="Customer" maxLength={60} value={project.customer} onChange={(e) => patch({ customer: e.target.value })} />
        <input className={input + ' !py-2 !text-sm'} aria-label={`${noun} name`} placeholder="Site / job name" maxLength={60} value={project.name} onChange={(e) => patch({ name: e.target.value })} />
      </div>
      <p className="mt-1.5 text-[11px] text-[#8a948d]">Saved on this phone. <button className="underline" onClick={() => { if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) remove(); }}>Delete this {noun}</button></p>
    </Card>
  );
}
