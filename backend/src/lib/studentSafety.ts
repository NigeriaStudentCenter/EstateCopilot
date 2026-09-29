// Student housing safety standards — what a host can declare for a
// student-friendly place, shown to students as a checklist and a score.
// "Essential" items are the ones a Student Ambassador checks on an
// inspection visit before the listing gets the Inspected badge.

export interface SafetyFeature {
  key: string;
  label: string;
  essential: boolean;
}

export const SAFETY_FEATURES: SafetyFeature[] = [
  { key: 'GATED', label: 'Gated compound / controlled entry', essential: true },
  { key: 'SECURITY_GUARD', label: 'Security guard or porter', essential: false },
  { key: 'BURGLARY_PROOF', label: 'Burglary-proof doors and windows', essential: true },
  { key: 'ROOM_LOCK', label: 'Lockable room door (key per student)', essential: true },
  { key: 'FIRE_EXTINGUISHER', label: 'Fire extinguisher in the building', essential: true },
  { key: 'SMOKE_ALARM', label: 'Smoke alarm', essential: false },
  { key: 'SAFE_WIRING', label: 'Safe electrical wiring (no exposed cables)', essential: true },
  { key: 'GENERATOR_OUTSIDE', label: 'Generator kept outside, away from rooms', essential: true },
  { key: 'WATER_SUPPLY', label: 'Reliable clean water supply', essential: true },
  { key: 'POWER_BACKUP', label: 'Power backup (inverter, solar or generator)', essential: false },
  { key: 'WELL_LIT', label: 'Well-lit compound and route to campus', essential: false },
  { key: 'CCTV', label: 'CCTV', essential: false },
  { key: 'FIRST_AID', label: 'First-aid kit', essential: false },
  { key: 'CARETAKER_ON_SITE', label: 'Caretaker living on site', essential: false },
];

const KEYS = new Set(SAFETY_FEATURES.map((f) => f.key));

export function cleanSafetyFeatures(keys: string[]): string[] {
  return [...new Set(keys.filter((k) => KEYS.has(k)))];
}

/** 0–100: essentials weigh double. */
export function safetyScore(keys: string[] | null | undefined): number {
  const have = new Set(keys ?? []);
  let total = 0;
  let got = 0;
  for (const f of SAFETY_FEATURES) {
    const w = f.essential ? 2 : 1;
    total += w;
    if (have.has(f.key)) got += w;
  }
  return Math.round((got / total) * 100);
}

export function missingEssentials(keys: string[] | null | undefined): string[] {
  const have = new Set(keys ?? []);
  return SAFETY_FEATURES.filter((f) => f.essential && !have.has(f.key)).map((f) => f.label);
}
