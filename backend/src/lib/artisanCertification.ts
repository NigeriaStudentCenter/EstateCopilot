import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { namesMatch } from './nameMatch.js';
import { certificateUrl } from './academy.js';
import { computeArtisanScore } from './artisanScore.js';
import { mockArtisans } from './mockArtisans.js';

export interface CertificateView {
  certificateId: string;
  course: string;
  courseTitle: string;
  holderName: string;
  issuedAt: string;
  nameMatched: boolean;
  url: string;
}
export interface CertificationState {
  certified: boolean;
  idVerified: boolean;
  verificationTier: number;
  certificates: CertificateView[];
}

type Cred = { kind: string; status: string; resolvedName?: string | null; verifiedAt?: Date | string | null };
const verifiedName = (creds: Cred[]): string | null => {
  const ok = creds.filter((c) => (c.kind === 'NIN' || c.kind === 'BVN') && c.status === 'VERIFIED' && c.resolvedName);
  return ok.length ? (ok[ok.length - 1].resolvedName as string) : null;
};

export const toView = (c: { certificateId: string; course: string; courseTitle: string; holderName: string; issuedAt: Date | string; nameMatched: boolean }): CertificateView => ({
  certificateId: c.certificateId,
  course: c.course,
  courseTitle: c.courseTitle,
  holderName: c.holderName,
  issuedAt: new Date(c.issuedAt).toISOString(),
  nameMatched: c.nameMatched,
  url: certificateUrl(c.certificateId),
});

// Re-evaluates an artisan's certificates against their verified ID name. Call after linking a certificate and
// after a successful NIN/BVN check, so the order they do those in does not matter. "Certified" (tier 3) needs
// BOTH a verified ID and a certificate whose name matches it.
export async function refreshCertification(artisanId: string): Promise<CertificationState> {
  if (env.mockMode) {
    const m = mockArtisans.get(artisanId);
    if (!m) return { certified: false, idVerified: false, verificationTier: 0, certificates: [] };
    const idName = verifiedName(m.credentials);
    for (const c of m.certificates) c.nameMatched = !!idName && namesMatch(c.holderName, idName);
    const certified = m.certificates.some((c) => c.nameMatched);
    if (certified && m.verificationTier < 3) {
      m.verificationTier = 3;
      m.score = computeArtisanScore(m);
    }
    return { certified, idVerified: !!idName, verificationTier: m.verificationTier, certificates: m.certificates.map(toView) };
  }
  const a = await prisma.artisan.findUnique({ where: { id: artisanId }, include: { credentials: true, certificates: true } });
  if (!a) return { certified: false, idVerified: false, verificationTier: 0, certificates: [] };
  const idName = verifiedName(a.credentials);
  const certs = [];
  for (const c of a.certificates) {
    const matched = !!idName && namesMatch(c.holderName, idName);
    if (matched !== c.nameMatched) await prisma.artisanCertificate.update({ where: { id: c.id }, data: { nameMatched: matched } });
    certs.push({ ...c, nameMatched: matched });
  }
  const certified = certs.some((c) => c.nameMatched);
  let tier = a.verificationTier;
  if (certified && tier < 3) {
    tier = 3;
    const score = computeArtisanScore({ ratingAvg: a.ratingAvg, ratingCount: a.ratingCount, jobsCompleted: a.jobsCompleted, verificationTier: tier, lastActiveAt: a.lastActiveAt });
    await prisma.artisan.update({ where: { id: a.id }, data: { verificationTier: tier, score } });
  }
  return { certified, idVerified: !!idName, verificationTier: tier, certificates: certs.map(toView) };
}
