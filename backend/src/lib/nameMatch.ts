// Loose, diacritic- and order-insensitive comparison of two personal names. Used to check that the name on a
// course certificate is the person whose NIN/BVN was verified. Two names match when they share at least two name
// parts (a middle name may be missing on one side); a single-part name only matches another single-part name.
const parts = (s: string): string[] =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’-]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

export function namesMatch(a: string, b: string): boolean {
  const A = new Set(parts(a)), B = new Set(parts(b));
  if (!A.size || !B.size) return false;
  if (A.size === 1 || B.size === 1) return A.size === 1 && B.size === 1 && [...A][0] === [...B][0];
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return common >= 2;
}
