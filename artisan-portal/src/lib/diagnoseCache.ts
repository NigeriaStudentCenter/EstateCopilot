import type { Diagnosis, DiagnosisCard } from './api';

// Small per-user cache so past diagnoses open with no signal. Cleared on sign-out (see auth.clearToken).
const key = (artisanId: string, kind: 'list' | 'one', id = '') => `ec_diag_${artisanId}_${kind}${id ? '_' + id : ''}`;
const MAX_FULL = 20;

export function saveList(artisanId: string, list: DiagnosisCard[]): void {
  try { localStorage.setItem(key(artisanId, 'list'), JSON.stringify(list)); } catch { /* storage full or private mode */ }
}
export function loadList(artisanId: string): DiagnosisCard[] {
  try { return JSON.parse(localStorage.getItem(key(artisanId, 'list')) || '[]'); } catch { return []; }
}
export function saveOne(artisanId: string, d: Diagnosis): void {
  try {
    localStorage.setItem(key(artisanId, 'one', d.id), JSON.stringify(d));
    const idx = JSON.parse(localStorage.getItem(key(artisanId, 'one', '_index')) || '[]') as string[];
    const next = [d.id, ...idx.filter((x) => x !== d.id)];
    next.slice(MAX_FULL).forEach((old) => localStorage.removeItem(key(artisanId, 'one', old)));
    localStorage.setItem(key(artisanId, 'one', '_index'), JSON.stringify(next.slice(0, MAX_FULL)));
  } catch { /* ignore */ }
}
export function loadOne(artisanId: string, id: string): Diagnosis | null {
  try { const v = localStorage.getItem(key(artisanId, 'one', id)); return v ? (JSON.parse(v) as Diagnosis) : null; } catch { return null; }
}
