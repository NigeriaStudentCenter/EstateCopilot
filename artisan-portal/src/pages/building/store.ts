import { newJob, MIXES, KIND_LABEL, type Job, type JobKind } from '../../lib/building';
import { uid } from '../tools/useProjects';

export interface BuildingData { jobs: Job[]; prices: Record<string, number> }
export const makeBuilding = (): BuildingData => ({ jobs: [], prices: {} });

const KINDS = Object.keys(KIND_LABEL) as JobKind[];
const WORDS = new Set(['porcelain', 'ceramic', 'straight', 'diagonal', 'herringbone', 'gable', 'hip', 'mono', 'longspan', 'corrugated', 'stone']);
const THICK = new Set([100, 150, 225]);

// Whatever is in storage is untrusted (an old version, hand-edited): rebuild every field from the defaults.
export function cleanBuilding(raw: unknown): BuildingData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const jobs: Job[] = (Array.isArray(r.jobs) ? r.jobs.slice(0, 60) : []).flatMap((x): Job[] => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (!KINDS.includes(o.kind as JobKind)) return [];
    const base = newJob(o.kind as JobKind, typeof o.id === 'string' ? o.id.slice(0, 20) : uid()) as unknown as Record<string, unknown>;
    for (const k of Object.keys(base)) {
      const d = base[k], v = o[k];
      if (k === 'id' || k === 'kind') continue;
      if (k === 'label') { base[k] = typeof v === 'string' && v.trim() ? v.slice(0, 40) : d; continue; }
      if (typeof d === 'number') base[k] = typeof v === 'number' && Number.isFinite(v) ? Math.min(1e6, Math.max(-1e6, v)) : d;
      else if (typeof d === 'boolean') base[k] = typeof v === 'boolean' ? v : d;
      else if (typeof d === 'string') base[k] = typeof v === 'string' && (WORDS.has(v) || v in MIXES) ? v : d;
    }
    if (!THICK.has(base.thicknessMm as number) && 'thicknessMm' in base && o.kind === 'blocks') base.thicknessMm = 225;
    return [base as unknown as Job];
  });
  const prices: Record<string, number> = {};
  if (r.prices && typeof r.prices === 'object') for (const [k, v] of Object.entries(r.prices as Record<string, unknown>).slice(0, 80)) if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9 && k.length < 80) prices[k] = v;
  return { jobs, prices };
}
