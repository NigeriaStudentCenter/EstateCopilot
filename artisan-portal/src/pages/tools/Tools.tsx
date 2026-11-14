import React from 'react';
import type { Me } from '../../lib/api';
import Solar from '../Solar';
import Building from '../building/Building';
import Hvac from '../hvac/Hvac';

export type ToolId = 'solar' | 'building' | 'hvac';
export const TOOL_INFO: Record<ToolId, { label: string; icon: string }> = {
  solar: { label: 'Solar', icon: '☀️' }, building: { label: 'Building', icon: '🧱' }, hvac: { label: 'AC', icon: '❄️' },
};
const BUILD = ['BRICKLAYER', 'TILER', 'ROOFER'];

// The calculators an artisan gets follow the trades on their profile: solar for Solar & Inverter, the materials estimator for
// bricklayers, tilers and roofers, and AC sizing for AC technicians. Everything runs on the phone.
export function toolsFor(me: Me): ToolId[] {
  const t = me.trades.map((x) => x.trade);
  const out: ToolId[] = [];
  if (t.includes('SOLAR_INVERTER')) out.push('solar');
  if (t.some((x) => BUILD.includes(x))) out.push('building');
  if (t.includes('AC_TECHNICIAN')) out.push('hvac');
  return out;
}

const KEY = 'ec_tools_last';
export default function Tools({ me, flash }: { me: Me; flash: (t: string) => void }) {
  const tools = toolsFor(me);
  const [tool, setTool] = React.useState<ToolId>(() => {
    try { const v = localStorage.getItem(KEY); if (v && (tools as string[]).includes(v)) return v as ToolId; } catch { /* storage blocked */ }
    return tools[0];
  });
  const current: ToolId = tools.includes(tool) ? tool : tools[0];
  const pick = (t: ToolId) => { setTool(t); try { localStorage.setItem(KEY, t); } catch { /* storage blocked */ } window.scrollTo(0, 0); };
  if (tools.length === 0) return null;
  const embedded = tools.length > 1;
  return (
    <>
      {embedded && (
        <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]" role="tablist" aria-label="Calculators">
          <div className="grid gap-1.5 rounded-xl bg-black/5 p-1" style={{ gridTemplateColumns: `repeat(${tools.length}, minmax(0, 1fr))` }}>
            {tools.map((t) => <button key={t} role="tab" aria-selected={current === t} onClick={() => pick(t)} className={`min-h-[40px] rounded-lg text-sm font-semibold ${current === t ? 'bg-white text-ochre-700 shadow-sm' : 'text-[#42504a]'}`}><span className="mr-1">{TOOL_INFO[t].icon}</span>{TOOL_INFO[t].label}</button>)}
          </div>
        </div>
      )}
      {current === 'solar' && <Solar me={me} flash={flash} embedded={embedded} />}
      {current === 'building' && <Building me={me} flash={flash} embedded={embedded} />}
      {current === 'hvac' && <Hvac me={me} flash={flash} embedded={embedded} />}
    </>
  );
}
