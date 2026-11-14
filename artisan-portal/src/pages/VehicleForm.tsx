import { Card, Field, input } from '../lib/ui';
import type { VehicleInfo } from '../lib/api';

export interface VehicleDraft { vin: string; make: string; model: string; year: string; market: string; fuel: string; codes: string; exhaust: boolean; sensors: boolean; wiring: boolean; terms: boolean }
export const emptyVehicle = (): VehicleDraft => ({ vin: '', make: '', model: '', year: '', market: 'UNKNOWN', fuel: 'PETROL', codes: '', exhaust: false, sensors: false, wiring: false, terms: false });
export const AUTO_TERMS = 'AUTO_V1';

// Checks the draft and turns it into what the server expects. Returns a message when something is wrong.
export function vehicleFromDraft(d: VehicleDraft): { error: string } | { vehicle: VehicleInfo } {
  const vin = d.vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { error: 'Enter the 17-character VIN (letters and numbers, no I, O or Q). Parts are matched by VIN.' };
  const codes = d.codes.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (codes.some((c) => !/^[PBCU][0-3][0-9A-F]{3}$/.test(c))) return { error: 'A fault code looks like P0171. Check the codes you typed.' };
  const year = d.year.trim() ? Number(d.year) : undefined;
  if (year !== undefined && !(Number.isInteger(year) && year >= 1960 && year <= 2035)) return { error: 'Check the year.' };
  if (!d.terms) return { error: 'Tick the box to accept the terms.' };
  return { vehicle: { vin, make: d.make.trim() || undefined, model: d.model.trim() || undefined, year, market: d.market, fuel: d.fuel, codes: codes.length ? codes : undefined, modified: { exhaust: d.exhaust, sensors: d.sensors, wiring: d.wiring } } };
}

const MARKETS = [['UNKNOWN', 'Not sure'], ['NIGERIA_NEW', 'Nigerian-new'], ['US', 'US (tokunbo)'], ['EUROPE', 'European'], ['JAPAN', 'Japanese'], ['GCC', 'GCC / Middle East']];
const FUELS = [['PETROL', 'Petrol'], ['DIESEL', 'Diesel'], ['GAS', 'Gas / LPG'], ['HYBRID', 'Hybrid'], ['EV', 'Electric']];

export default function VehicleForm({ v, set }: { v: VehicleDraft; set: (f: (d: VehicleDraft) => VehicleDraft) => void }) {
  const on = (k: keyof VehicleDraft) => (val: string | boolean) => set((d) => ({ ...d, [k]: val }));
  return (
    <Card className="mb-3 space-y-2.5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">The vehicle</p>
      <Field label="VIN (17 characters)" hint="On the windscreen corner, the door pillar or the papers. Parts are matched by VIN, because Nigerian cars come in US, European, Japanese and GCC versions.">
        <input className={input} autoCapitalize="characters" maxLength={17} value={v.vin} onChange={(e) => on('vin')(e.target.value.toUpperCase())} placeholder="e.g. 1HGCM82633A004352" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Make"><input className={input} maxLength={40} value={v.make} onChange={(e) => on('make')(e.target.value)} placeholder="Toyota" /></Field>
        <Field label="Model"><input className={input} maxLength={40} value={v.model} onChange={(e) => on('model')(e.target.value)} placeholder="Camry" /></Field>
        <Field label="Year"><input className={input} inputMode="numeric" maxLength={4} value={v.year} onChange={(e) => on('year')(e.target.value.replace(/\D/g, ''))} placeholder="2012" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Where it was made for"><select className={input} value={v.market} onChange={(e) => on('market')(e.target.value)}>{MARKETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Fuel"><select className={input} value={v.fuel} onChange={(e) => on('fuel')(e.target.value)}>{FUELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <Field label="Fault codes from the scanner (optional)" hint="Separate with spaces, for example P0171 P0300."><input className={input} value={v.codes} onChange={(e) => on('codes')(e.target.value.toUpperCase())} placeholder="P0171" /></Field>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Has the owner changed anything?</p>
        {([['exhaust', 'Catalytic converter removed or gutted'], ['sensors', 'Oxygen sensor bypassed or spaced'], ['wiring', 'Wiring or relays bridged (for example the fan relay)']] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 py-1.5 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#b4530e]" checked={v[k]} onChange={(e) => on(k)(e.target.checked)} />{l}</label>
        ))}
        <p className="text-xs text-[#8a948d]">A new sensor will not fix a circuit that has been bypassed, so tell us.</p>
      </div>
      <label className="flex items-start gap-2 rounded-xl bg-ochre-50 p-3 text-xs text-ochre-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#b4530e]" checked={v.terms} onChange={(e) => on('terms')(e.target.checked)} />
        <span>I understand this app gives diagnostic decision support, not a certified mechanical inspection. Airbag, high-voltage, fuel-system, brake and steering work must be done by qualified people, and I stay responsible for safe work.</span>
      </label>
    </Card>
  );
}
