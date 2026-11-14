import React from 'react';
import type { Me } from '../../lib/api';
import { Button, Card, Screen } from '../../lib/ui';
import { KIND_LABEL, costOf, summaryText, totals, unitText, newJob, tileResult, blockResult, plasterResult, screedResult, concreteResult, roofResult, round, type Job, type JobKind } from '../../lib/building';
import { ProjectBar } from '../tools/parts';
import { uid, useProjects } from '../tools/useProjects';
import { JobEditor } from './JobForm';
import { cleanBuilding, makeBuilding, type BuildingData } from './store';

const ICON: Record<JobKind, string> = { tiles: '🔲', blocks: '🧱', plaster: '🪣', screed: '▭', concrete: '⬜', roof: '🏠' };

function headline(j: Job): string {
  switch (j.kind) {
    case 'tiles': { const r = tileResult(j); return `${round(r.area, 1)} m² · ${r.pieces} tiles · ${Math.ceil(r.cartons - 1e-9)} cartons`; }
    case 'blocks': { const r = blockResult(j); return `${round(r.net, 1)} m² · ${r.blocks} blocks · ${round(r.bags, 1)} bags cement`; }
    case 'plaster': { const r = plasterResult(j); return `${j.areaM2} m² · ${round(r.bags, 1)} bags cement`; }
    case 'screed': { const r = screedResult(j); return `${j.areaM2} m² · ${round(r.bags, 1)} bags cement`; }
    case 'concrete': { const r = concreteResult(j); return `${round(r.wet, 2)} m³ · ${round(r.bags, 1)} bags cement`; }
    case 'roof': { const r = roofResult(j); return `${round(r.areaM2, 1)} m² roof · ${j.covering === 'stone' ? `${r.stonePieces} tiles` : r.sheets > 0 ? `${r.sheets} sheets` : `${round(r.runningM)} m of sheet`}`; }
  }
}

export default function Building({ me, flash, embedded = false }: { me: Me; flash: (t: string) => void; embedded?: boolean }) {
  const { projects, project, setActiveId, setData, patch, add, remove } = useProjects<BuildingData>('building', me.id, makeBuilding, cleanBuilding, 'My first job');
  const [view, setView] = React.useState<'jobs' | 'list'>('jobs');
  const [open, setOpen] = React.useState<string | null>(null);
  const d = project.data;

  function addJob(kind: JobKind) {
    if (d.jobs.length >= 60) return flash('That is a lot of jobs. Start a new project.');
    const j = newJob(kind, uid());
    setData((x) => ({ ...x, jobs: [...x.jobs, j] })); setOpen(j.id);
  }
  const editJob = (id: string) => (f: (j: Job) => Job) => setData((x) => ({ ...x, jobs: x.jobs.map((j) => (j.id === id ? f(j) : j)) }));

  const list = totals(d.jobs);
  const total = list.reduce((s, t) => s + costOf(t, d.prices), 0);
  const who = { project: project.name, customer: project.customer, by: me.businessName || me.name };
  const text = summaryText(d.jobs, d.prices, who);
  async function copy() { try { await navigator.clipboard.writeText(text); flash('Copied'); } catch { flash('Could not copy'); } }
  const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

  return (
    <Screen title="Materials estimator" embedded={embedded}>
      <ProjectBar projects={projects} project={project} setActiveId={setActiveId} patch={patch} add={add} remove={remove} flash={flash} noun="project" />

      <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-black/10 bg-white/95 px-4 py-2 backdrop-blur" role="tablist">
        <div className="grid grid-cols-2 gap-1.5">
          {([['jobs', `Jobs (${d.jobs.length})`], ['list', 'Materials list']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`min-h-[40px] rounded-lg text-xs font-semibold ${view === id ? 'bg-ochre-500 text-white' : 'bg-black/5 text-[#42504a]'}`}>{label}</button>)}
        </div>
      </div>

      {view === 'jobs' && (
        <div className="space-y-3 pb-24">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Add a job</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(KIND_LABEL) as JobKind[]).map((k) => <button key={k} onClick={() => addJob(k)} className="min-h-[44px] rounded-xl border border-black/15 px-2 text-left text-sm font-medium text-[#42504a] active:bg-black/5"><span className="mr-1.5">{ICON[k]}</span>{KIND_LABEL[k]}</button>)}
            </div>
          </div>
          {d.jobs.length === 0 && <Card className="p-4 text-center text-sm text-[#6d7a73]">No jobs yet. Add a tiling, blockwork, plaster, screed, concrete or roofing job above. The materials from every job add up on the Materials list.</Card>}
          {d.jobs.map((j) => (
            <div key={j.id}>
              <Card className="p-3">
                <button className="block w-full text-left" aria-expanded={open === j.id} onClick={() => setOpen(open === j.id ? null : j.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold"><span className="mr-1.5">{ICON[j.kind]}</span>{j.label}</p><p className="text-xs text-[#6d7a73]">{headline(j)}</p></div>
                    <span className="shrink-0 text-xs font-semibold text-ochre-700">{open === j.id ? 'Close' : 'Edit'}</span>
                  </div>
                </button>
                {open === j.id && (
                  <div className="mt-3 space-y-3">
                    <input className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" aria-label="Job name" maxLength={40} value={j.label} onChange={(e) => editJob(j.id)((x) => ({ ...x, label: e.target.value }))} />
                    <JobEditor job={j} onChange={editJob(j.id)} />
                    <div className="flex gap-4 text-xs font-semibold">
                      <button className="text-ochre-700 underline" onClick={() => { const c = { ...j, id: uid(), label: `${j.label} copy` } as Job; setData((x) => ({ ...x, jobs: [...x.jobs, c] })); setOpen(c.id); }}>Duplicate</button>
                      <button className="text-[#8a948d] underline" onClick={() => { setData((x) => ({ ...x, jobs: x.jobs.filter((y) => y.id !== j.id) })); setOpen(null); }}>Remove</button>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          ))}
          {d.jobs.length > 0 && <Button onClick={() => setView('list')}>See the materials list</Button>}
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-3 pb-6">
          {list.length === 0 && <Card className="p-4 text-center text-sm text-[#6d7a73]">Nothing to buy yet. Add jobs first.</Card>}
          {list.length > 0 && (
            <>
              <p className="text-xs text-[#6d7a73]">Cement, sand and the rest are added up across all your jobs before rounding. Type your supplier's price to see the cost.</p>
              <div id="spec-print" className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-lg font-extrabold">Materials list</p>
                <p className="text-xs text-[#6d7a73]">{[project.customer, project.name, new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })].filter(Boolean).join(' · ')}</p>
                <div className="mt-3 divide-y divide-black/10">
                  {list.map((t) => (
                    <div key={t.key} className="py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 text-sm font-semibold">{t.name}{t.spec ? <span className="font-normal text-[#6d7a73]"> · {t.spec}</span> : null}</p>
                        <p className="shrink-0 text-base font-extrabold">{t.qty} <span className="text-xs font-semibold text-[#6d7a73]">{unitText(t.unit, t.qty)}</span></p>
                      </div>
                      {t.note && <p className="text-xs text-[#8a948d]">{t.note}</p>}
                      <label className="mt-1 flex items-center gap-2 text-xs text-[#42504a] print:hidden">
                        <span className="shrink-0">₦ per {unitText(t.unit, 1)}</span>
                        <input className="w-28 rounded-lg border border-black/15 px-2 py-1.5 text-sm" inputMode="decimal" aria-label={`Price per ${unitText(t.unit, 1)} of ${t.name}`} placeholder="0"
                          value={d.prices[t.key] ? String(d.prices[t.key]) : ''} onChange={(e) => { const n = parseFloat(e.target.value.replace(/,/g, '')); setData((x) => ({ ...x, prices: { ...x.prices, [t.key]: Number.isFinite(n) && n >= 0 ? n : 0 } })); }} />
                        {d.prices[t.key] > 0 && <span className="ml-auto font-semibold">{naira(costOf(t, d.prices))}</span>}
                      </label>
                    </div>
                  ))}
                </div>
                {total > 0 && <p className="mt-3 flex items-baseline justify-between border-t border-black/20 pt-3 text-base font-extrabold"><span>Materials cost</span><span>{naira(total)}</span></p>}
                <p className="mt-3 text-[11px] leading-snug text-[#6d7a73]">Prepared by {who.by} · {me.phone}. An estimate for ordering. Quantities depend on the sizes your supplier sells and on site conditions. Add your labour and transport. Structural work must follow the engineer's design.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="ghost" onClick={() => window.print()}>Print / PDF</Button>
                <a className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-2 py-3 text-sm font-semibold text-white" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <Button variant="ghost" onClick={() => void copy()}>Copy</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Screen>
  );
}
