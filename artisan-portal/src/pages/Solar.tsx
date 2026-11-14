import React from 'react';
import type { Me } from '../lib/api';
import { Card, Screen, input } from '../lib/ui';
import { REGIONS, type Design } from '../lib/solar';
import LoadScreen from './solar/LoadScreen';
import BatteryScreen from './solar/BatteryScreen';
import SolarScreen from './solar/SolarScreen';
import SummaryScreen from './solar/SummaryScreen';
import { loadProjects, newProject, saveProjects, type Project } from './solar/store';

type Sub = 'load' | 'battery' | 'solar' | 'summary';
const SUBS: [Sub, string][] = [['load', '1 Load'], ['battery', '2 Battery'], ['solar', '3 Solar'], ['summary', '4 Spec']];

// Match the artisan's base state to a sun-hours region ("Lagos State" -> Lagos, "FCT" -> FCT (Abuja)).
function regionFor(state: string): string {
  const s = state.toLowerCase().replace(/\bstate\b/g, '').trim();
  if (/fct|abuja|federal capital/.test(s)) return 'FCT (Abuja)';
  return REGIONS.find((r) => r.toLowerCase() === s) ?? 'Lagos';
}

export default function Solar({ me, flash }: { me: Me; flash: (t: string) => void }) {
  const region0 = regionFor(me.baseState);
  const [projects, setProjects] = React.useState<Project[]>(() => { const p = loadProjects(me.id, region0); return p.length ? p : [newProject(region0, 'My first design')]; });
  const [activeId, setActiveId] = React.useState(() => projects[0].id);
  const [sub, setSub] = React.useState<Sub>('load');
  const project = projects.find((p) => p.id === activeId) ?? projects[0];

  React.useEffect(() => { saveProjects(me.id, projects); }, [me.id, projects]);

  const setDesign = React.useCallback((f: (d: Design) => Design) => {
    setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, design: f(p.design), updatedAt: Date.now() } : p)));
  }, [project.id]);
  const patch = (o: Partial<Pick<Project, 'name' | 'customer'>>) => setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, ...o, updatedAt: Date.now() } : p)));
  function add() {
    if (projects.length >= 30) return flash('You can keep 30 designs. Delete an old one first.');
    const p = newProject(region0, `Design ${projects.length + 1}`);
    setProjects((ps) => [...ps, p]); setActiveId(p.id); setSub('load');
  }
  function remove() {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    const rest = projects.filter((p) => p.id !== project.id);
    const next = rest.length ? rest : [newProject(region0, 'My first design')];
    setProjects(next); setActiveId(next[0].id);
  }

  return (
    <Screen title="Solar sizing">
      <Card className="mb-3 p-3">
        <div className="flex gap-2">
          <select className={input + ' !py-2'} aria-label="Saved design" value={project.id} onChange={(e) => setActiveId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.customer ? `${p.customer} · ` : ''}{p.name}</option>)}
          </select>
          <button onClick={add} className="shrink-0 rounded-xl border border-black/15 px-3 text-sm font-semibold text-ochre-700">+ New</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input className={input + ' !py-2 !text-sm'} aria-label="Customer name" placeholder="Customer" maxLength={60} value={project.customer} onChange={(e) => patch({ customer: e.target.value })} />
          <input className={input + ' !py-2 !text-sm'} aria-label="Design name" placeholder="Site / design name" maxLength={60} value={project.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <p className="mt-1.5 text-[11px] text-[#8a948d]">Saved on this phone. <button className="underline" onClick={remove}>Delete this design</button></p>
      </Card>

      <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-black/10 bg-white/95 px-4 py-2 backdrop-blur" role="tablist">
        <div className="grid grid-cols-4 gap-1.5">
          {SUBS.map(([id, label]) => <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)} className={`min-h-[40px] rounded-lg text-xs font-semibold ${sub === id ? 'bg-ochre-500 text-white' : 'bg-black/5 text-[#42504a]'}`}>{label}</button>)}
        </div>
      </div>

      {sub === 'load' && <LoadScreen design={project.design} setDesign={setDesign} flash={flash} />}
      {sub === 'battery' && <BatteryScreen design={project.design} setDesign={setDesign} />}
      {sub === 'solar' && <SolarScreen design={project.design} setDesign={setDesign} />}
      {sub === 'summary' && <SummaryScreen me={me} design={project.design} setDesign={setDesign} name={project.name} customer={project.customer} flash={flash} go={(t) => setSub(t)} />}
    </Screen>
  );
}
