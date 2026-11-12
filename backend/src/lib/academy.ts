import { env } from '../config/env.js';

export const CERT_ID_RE = /^BSOE-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

export interface AcademyCertificate {
  id: string;
  course: string;
  courseTitle: string;
  holderName: string;
  issuedAt: string;
}
export type AcademyLookup = { ok: true; cert: AcademyCertificate } | { ok: false; reason: 'not_found' | 'unavailable' };

// Verifies a certificate id against the academy's public endpoint. The id is unguessable and the endpoint
// returns no email or contact data, only the name, course and date.
export async function fetchAcademyCertificate(id: string): Promise<AcademyLookup> {
  try {
    const r = await fetch(`${env.academy.certApi}/certificate/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return { ok: false, reason: 'not_found' };
    if (!r.ok) return { ok: false, reason: 'unavailable' };
    const d = (await r.json()) as Partial<AcademyCertificate> & { valid?: boolean };
    if (!d.valid || d.id !== id || !d.course || !d.courseTitle || !d.holderName || !d.issuedAt) return { ok: false, reason: 'not_found' };
    return { ok: true, cert: { id: d.id, course: d.course, courseTitle: d.courseTitle, holderName: d.holderName, issuedAt: d.issuedAt } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export const certificateUrl = (id: string) => `${env.academy.siteBase}/learn/certificate.html?id=${encodeURIComponent(id)}`;
