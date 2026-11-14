import React from 'react';
import type { Me } from '../../lib/api';
import { Button, Card, Screen, input } from '../../lib/ui';
import { CLIMATE, USE, analyseRoom, climateFor, newRoom, projectTotals, round, summaryText, type Climate, type Room } from '../../lib/hvac';
import { ProjectBar, Select } from '../tools/parts';
import { uid, useProjects } from '../tools/useProjects';
import { RoomEditor } from './RoomForm';
import { regionFor } from '../Solar';
import { addAcsToSolar, solarProjectNames } from '../solar/store';
import { cleanHvac, makeHvac, type HvacData } from './store';

export default function Hvac({ me, flash, embedded = false, hasSolar = false, openSolar }: { me: Me; flash: (t: string) => void; embedded?: boolean; hasSolar?: boolean; openSolar?: () => void }) {
  const [solarId, setSolarId] = React.useState('');
  const climate0 = climateFor(me.baseState);
  const { projects, project, setActiveId, setData, patch, add, remove } = useProjects<HvacData>('hvac', me.id, () => makeHvac(climate0), (raw) => cleanHvac(raw, climate0), 'My first site');
  const [view, setView] = React.useState<'rooms' | 'summary'>('rooms');
  const [open, setOpen] = React.useState<string | null>(null);
  const d = project.data;
  const t = projectTotals(d);

  function addRoom() {
    if (d.rooms.length >= 40) return flash('That is a lot of rooms. Start a new site.');
    const r = newRoom(uid(), `Room ${d.rooms.length + 1}`);
    setData((x) => ({ ...x, rooms: [...x.rooms, r] })); setOpen(r.id);
  }
  const editRoom = (id: string) => (f: (r: Room) => Room) => setData((x) => ({ ...x, rooms: x.rooms.map((r) => (r.id === id ? f(r) : r)) }));
  const who = { project: project.name, customer: project.customer, by: me.businessName || me.name };
  const text = summaryText(d, who);
  async function copy() { try { await navigator.clipboard.writeText(text); flash('Copied'); } catch { flash('Could not copy'); } }

  return (
    <Screen title="AC sizing" embedded={embedded}>
      <ProjectBar projects={projects} project={project} setActiveId={setActiveId} patch={patch} add={add} remove={remove} flash={flash} noun="site" />
      <Card className="mb-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <Select label="Where is the site" value={d.ctx.climate} onChange={(v: Climate) => setData((x) => ({ ...x, ctx: { ...x.ctx, climate: v } }))} options={(Object.keys(CLIMATE) as Climate[]).map((k) => ({ v: k, l: CLIMATE[k].label }))} />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Room temperature</span>
            <select className={input} aria-label="Room temperature" value={d.ctx.indoorC} onChange={(e) => setData((x) => ({ ...x, ctx: { ...x.ctx, indoorC: Number(e.target.value) } }))}>{[22, 23, 24, 25, 26].map((c) => <option key={c} value={c}>{c} °C</option>)}</select>
          </label>
        </div>
        <p className="mt-1.5 text-xs text-[#8a948d]">{CLIMATE[d.ctx.climate].where}. Outside design temperature {CLIMATE[d.ctx.climate].outdoorC} °C.</p>
      </Card>

      <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-black/10 bg-white/95 px-4 py-2 backdrop-blur" role="tablist">
        <div className="grid grid-cols-2 gap-1.5">
          {([['rooms', `Rooms (${d.rooms.length})`], ['summary', 'Summary']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`min-h-[40px] rounded-lg text-xs font-semibold ${view === id ? 'bg-ochre-500 text-white' : 'bg-black/5 text-[#42504a]'}`}>{label}</button>)}
        </div>
      </div>

      {view === 'rooms' && (
        <div className="space-y-3 pb-24">
          <Button onClick={addRoom}>+ Add a room</Button>
          {d.rooms.length === 0 && <Card className="p-4 text-center text-sm text-[#6d7a73]">No rooms yet. Add a room and fill in its size, what is above it and which way its walls and windows face. The size of AC appears as you type.</Card>}
          {t.rooms.map(({ room, res }) => (
            <Card key={room.id} className={`p-3 ${open === room.id ? 'border-ochre-500' : ''}`}>
              <button className="block w-full text-left" aria-expanded={open === room.id} onClick={() => setOpen(open === room.id ? null : room.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">❄️ {room.name}</p><p className="text-xs text-[#6d7a73]">{USE[room.use].label} · {round(res.areaM2, 1)} m² · needs {round(res.btu, -2).toLocaleString('en')} BTU/h</p></div>
                  <div className="shrink-0 text-right"><p className="text-sm font-extrabold">{res.sizing.units > 1 ? `${res.sizing.units} × ` : ''}{res.sizing.perUnitBtu.toLocaleString('en')}</p><p className="text-[11px] text-[#6d7a73]">{res.sizing.hp}</p></div>
                </div>
              </button>
              {open === room.id && (
                <div className="mt-3 space-y-3">
                  <input className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" aria-label="Room name" maxLength={40} value={room.name} onChange={(e) => editRoom(room.id)((x) => ({ ...x, name: e.target.value }))} />
                  <RoomEditor room={room} ctx={d.ctx} onChange={editRoom(room.id)} />
                  <div className="flex gap-4 text-xs font-semibold">
                    <button className="text-ochre-700 underline" onClick={() => { const c = { ...room, id: uid(), name: `${room.name} copy` }; setData((x) => ({ ...x, rooms: [...x.rooms, c] })); setOpen(c.id); }}>Duplicate</button>
                    <button className="text-[#8a948d] underline" onClick={() => { setData((x) => ({ ...x, rooms: x.rooms.filter((r) => r.id !== room.id) })); setOpen(null); }}>Remove</button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {view === 'rooms' && open && d.rooms.some((r) => r.id === open) && (() => {
        const room = d.rooms.find((r) => r.id === open)!; const res = analyseRoom(room, d.ctx);
        return (
          <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-md px-3">
            <div className="flex items-center justify-between rounded-2xl bg-[#16241d] px-4 py-3 text-white shadow-lg" aria-live="polite">
              <div><p className="text-[10px] uppercase tracking-wide text-white/60">{room.name} needs</p><p className="text-lg font-extrabold">{round(res.btu, -2).toLocaleString('en')} BTU/h</p></div>
              <div className="text-right"><p className="text-[10px] uppercase tracking-wide text-white/60">Fit</p><p className="text-lg font-extrabold">{res.sizing.units > 1 ? `${res.sizing.units} × ` : ''}{res.sizing.perUnitBtu.toLocaleString('en')} · {res.sizing.hp}</p></div>
            </div>
          </div>
        );
      })()}

      {view === 'summary' && (
        <div className="space-y-3 pb-6">
          {d.rooms.length === 0 && <Card className="p-4 text-center text-sm text-[#6d7a73]">Add rooms first.</Card>}
          {d.rooms.length > 0 && (
            <>
              <div id="spec-print" className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-lg font-extrabold">Air-conditioner sizing</p>
                <p className="text-xs text-[#6d7a73]">{[project.customer, project.name, new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })].filter(Boolean).join(' · ')}</p>
                <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-xs"><thead><tr className="text-left text-[#6d7a73]"><th className="py-1 pr-2 font-semibold">Room</th><th className="py-1 pr-2 text-right font-semibold">Load BTU/h</th><th className="py-1 pr-2 font-semibold">Fit</th><th className="py-1 text-right font-semibold">Breaker</th></tr></thead>
                  <tbody>{t.rooms.map(({ room, res }) => <tr key={room.id} className="border-t border-black/10"><td className="py-1.5 pr-2">{room.name}</td><td className="py-1.5 pr-2 text-right">{round(res.btu, -2).toLocaleString('en')}</td><td className="py-1.5 pr-2 font-semibold">{res.sizing.units > 1 ? `${res.sizing.units} × ` : ''}{res.sizing.perUnitBtu.toLocaleString('en')} ({res.sizing.hp}) {room.acType === 'INVERTER' ? 'inv.' : 'fixed'}</td><td className="py-1.5 text-right">{res.electrical.breakerA} A</td></tr>)}</tbody></table></div>
                <p className="mt-3 text-sm"><b>{t.units}</b> unit{t.units === 1 ? '' : 's'} · about <b>{round(t.runningW / 1000, 1)} kW</b> running · <b>{round(t.kwhPerDay, 1)} kWh</b> a day at the hours you entered.</p>
                <p className="mt-3 text-[11px] leading-snug text-[#6d7a73]">Prepared by {who.by} · {me.phone}. A sizing estimate from typical figures for {CLIMATE[d.ctx.climate].label.toLowerCase()} conditions, with a 10% allowance. Confirm on site. Install to the manufacturer's instructions and the wiring regulations; refrigerant work needs a trained technician.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="ghost" onClick={() => window.print()}>Print / PDF</Button>
                <a className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-2 py-3 text-sm font-semibold text-white" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <Button variant="ghost" onClick={() => void copy()}>Copy</Button>
              </div>
              {hasSolar && (
                <Card className="p-3">
                  <p className="text-sm font-semibold">Powering these from solar?</p>
                  <p className="mb-2 text-xs text-[#6d7a73]">Adds each room's AC to a solar design as a load, with its running watts, hours and start-up surge.</p>
                  <div className="flex gap-2">
                    <select className={input + ' !py-2'} aria-label="Solar design" value={solarId} onChange={(e) => setSolarId(e.target.value)}>
                      <option value="">First solar design</option>
                      {solarProjectNames(me.id, regionFor(me.baseState)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button className="shrink-0 rounded-xl bg-ochre-500 px-4 text-sm font-semibold text-white" onClick={() => {
                      const name = addAcsToSolar(me.id, regionFor(me.baseState), solarId || null, t.rooms.map(({ room, res }) => ({ name: room.name, units: res.sizing.units, runningW: res.electrical.runningW, hours: room.hoursPerDay, acType: room.acType, use: room.use })));
                      if (!name) return flash('Could not find a solar design');
                      flash(`Added to "${name}"`); openSolar?.();
                    }}>Add to solar</button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </Screen>
  );
}
