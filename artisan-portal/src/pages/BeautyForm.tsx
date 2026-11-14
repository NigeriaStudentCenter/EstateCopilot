import { Card, Field, input } from '../lib/ui';
import type { ClientInfo } from '../lib/api';

export interface ClientDraft { area: ClientInfo['area']; fitz: string; pregnant: boolean; breastfeeding: boolean; isotretinoin: boolean; retinoids: boolean; antibiotics: boolean; steroids: boolean; bloodThinners: boolean; immunosuppressants: boolean; keloidProne: boolean; diabetic: boolean; eczemaOrPsoriasis: boolean; openWoundOrInfection: boolean; allergies: string; consent: boolean; terms: boolean }
export const emptyClient = (): ClientDraft => ({ area: 'SKIN', fitz: '', pregnant: false, breastfeeding: false, isotretinoin: false, retinoids: false, antibiotics: false, steroids: false, bloodThinners: false, immunosuppressants: false, keloidProne: false, diabetic: false, eczemaOrPsoriasis: false, openWoundOrInfection: false, allergies: '', consent: false, terms: false });
export const BEAUTY_TERMS = 'BEAUTY_V1';
export const BEAUTY_CONSENT = 'CLIENT_CONSENT_V1';

export function clientFromDraft(d: ClientDraft): { error: string } | { client: ClientInfo } {
  if (!d.consent) return { error: 'Tick the box to confirm the client agreed to the photo and its analysis. Never photograph a client without consent.' };
  if (!d.terms) return { error: 'Tick the box to accept the terms.' };
  const { fitz, allergies, consent: _c, terms: _t, ...flags } = d;
  return { client: { ...flags, fitzpatrick: fitz ? Number(fitz) : undefined, allergies: allergies.trim() || undefined } };
}

const AREAS: [ClientInfo['area'], string][] = [['SKIN', 'Skin'], ['HAIR', 'Hair & scalp'], ['NAILS', 'Nails']];
const FITZ = [['', 'Not sure'], ['1', 'I: always burns, never tans'], ['2', 'II: burns easily, tans a little'], ['3', 'III: sometimes burns, tans'], ['4', 'IV: rarely burns, tans well'], ['5', 'V: brown skin, rarely burns'], ['6', 'VI: dark brown to black skin']];
const MEDS: [keyof ClientDraft, string][] = [['isotretinoin', 'Isotretinoin (Roaccutane) now or in the last 6 months'], ['retinoids', 'Retinoid or retinol creams'], ['antibiotics', 'Antibiotics'], ['steroids', 'Steroid creams or tablets'], ['bloodThinners', 'Blood thinners'], ['immunosuppressants', 'Immunosuppressant medicines']];
const CONDS: [keyof ClientDraft, string][] = [['pregnant', 'Pregnant'], ['breastfeeding', 'Breastfeeding'], ['keloidProne', 'Keloid-prone (raised scars)'], ['diabetic', 'Diabetic'], ['eczemaOrPsoriasis', 'Eczema or psoriasis on the area'], ['openWoundOrInfection', 'Open wound or infection on the area']];

export default function BeautyForm({ v, set }: { v: ClientDraft; set: (f: (d: ClientDraft) => ClientDraft) => void }) {
  const on = (k: keyof ClientDraft) => (val: string | boolean) => set((d) => ({ ...d, [k]: val }));
  const box = (k: keyof ClientDraft, label: string) => <label key={k} className="flex items-center gap-2 py-1.5 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0 accent-[#b4530e]" checked={Boolean(v[k])} onChange={(e) => on(k)(e.target.checked)} />{label}</label>;
  return (
    <Card className="mb-3 space-y-3 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">The client</p>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Area">
        {AREAS.map(([k, l]) => <button key={k} type="button" aria-pressed={v.area === k} onClick={() => on('area')(k)} className={`min-h-[40px] rounded-lg px-1 text-xs font-semibold ${v.area === k ? 'bg-ochre-500 text-white' : 'bg-black/5 text-[#42504a]'}`}>{l}</button>)}
      </div>
      <Field label="Skin tone (Fitzpatrick)" hint="Darker skin hides redness from the camera and marks more easily. It changes the advice.">
        <select className={input} value={v.fitz} onChange={(e) => on('fitz')(e.target.value)}>{FITZ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Medicines</p>{MEDS.map(([k, l]) => box(k, l))}</div>
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Health and the area</p>{CONDS.map(([k, l]) => box(k, l))}</div>
      <Field label="Allergies (optional)"><input className={input} maxLength={120} value={v.allergies} onChange={(e) => on('allergies')(e.target.value)} placeholder="e.g. nuts, hair dye (PPD), latex" /></Field>
      <label className="flex items-start gap-2 rounded-xl bg-moss-600/10 p-3 text-xs text-moss-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#0a7d3b]" checked={v.consent} onChange={(e) => on('consent')(e.target.checked)} />
        <span><b>Client consent.</b> The client has agreed to this photo being taken and analysed, and knows it may be stored for their records. Never photograph a client without asking.</span>
      </label>
      <label className="flex items-start gap-2 rounded-xl bg-ochre-50 p-3 text-xs text-ochre-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#b4530e]" checked={v.terms} onChange={(e) => on('terms')(e.target.checked)} />
        <span>I understand this app gives observations to support my consultation, not a medical diagnosis. Anything medical goes to a doctor, and I stay responsible for safe treatment.</span>
      </label>
    </Card>
  );
}
