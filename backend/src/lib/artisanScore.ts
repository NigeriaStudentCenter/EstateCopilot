// The Artisan Score — a single 0-100 number that orders the public directory.
//
// The full model (blueprint §03) also weighs responsiveness and dispute rate,
// which don't exist until Phase 3 (messaging + reviews). Phase 2 scores on the
// four axes we can measure today — Bayesian rating, jobs completed, verification
// tier and recency — and rescales their combined weight (78) back up to 100 so
// the number still reads as "out of 100". When P3 lands, add the two missing
// terms here and drop the rescale.

export interface ScoreInputs {
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  verificationTier: number;
  lastActiveAt: string | Date;
}

const RATING_WEIGHT = 40; // of 78
const JOBS_WEIGHT = 18;
const TIER_WEIGHT = 14;
const RECENCY_WEIGHT = 6;
const AVAILABLE_WEIGHT = RATING_WEIGHT + JOBS_WEIGHT + TIER_WEIGHT + RECENCY_WEIGHT; // 78

// Bayesian prior — pulls a 5.0-from-one-review artisan back toward the mean
// until they've built a track record. M = prior weight, C = platform mean.
const BAYES_M = 5;
const BAYES_C = 4.2;

const DAY = 24 * 60 * 60 * 1000;

export function bayesianRating(ratingAvg: number, ratingCount: number): number {
  return (ratingCount * ratingAvg + BAYES_M * BAYES_C) / (ratingCount + BAYES_M);
}

function recencyFactor(lastActiveAt: string | Date): number {
  const ageMs = Date.now() - new Date(lastActiveAt).getTime();
  if (ageMs <= 7 * DAY) return 1;
  if (ageMs <= 30 * DAY) return 0.5;
  return 0;
}

export function computeArtisanScore(a: ScoreInputs): number {
  const rating = RATING_WEIGHT * (bayesianRating(a.ratingAvg, a.ratingCount) / 5);
  const jobs = JOBS_WEIGHT * Math.min(a.jobsCompleted / 25, 1);
  const tier = TIER_WEIGHT * (Math.max(0, Math.min(a.verificationTier, 3)) / 3);
  const recency = RECENCY_WEIGHT * recencyFactor(a.lastActiveAt);
  const raw = ((rating + jobs + tier + recency) * 100) / AVAILABLE_WEIGHT;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
