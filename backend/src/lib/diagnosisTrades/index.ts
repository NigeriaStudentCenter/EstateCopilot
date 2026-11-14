import type { DiagnosisTrade } from '../diagnosisSchema.js';
import type { TradeConfig } from './types.js';
import { plumbing } from './plumbing.js';
import { electrical } from './electrical.js';
import { carpentry } from './carpentry.js';
import { solar } from './solar.js';
import { building } from './building.js';
import { hvac } from './hvac.js';

export type { TradeConfig } from './types.js';
export { ISOLATE_STEP, RETEST_STEP } from './electrical.js';
export { MEASURE_CHECK } from './carpentry.js';
export { SOLAR_ISOLATE_STEP, SOLAR_RESTORE_STEP, SOLAR_VOC_CHECK } from './solar.js';

// The registry. To add a trade: write diagnosisTrades/<trade>.ts, add it here, add its enum value in diagnosisSchema.ts
// and its catalogue in Kolo. It stays hidden until it is listed in DIAGNOSE_TRADES_LIVE or DIAGNOSE_TRADES_BETA.
export const TRADE_CONFIGS: Record<DiagnosisTrade, TradeConfig> = { PLUMBING: plumbing, ELECTRICAL: electrical, CARPENTRY: carpentry, SOLAR: solar, BUILDING: building, HVAC: hvac };
export const TRADE_IDS = Object.keys(TRADE_CONFIGS) as DiagnosisTrade[];
export const isDiagnosisTrade = (v: string): v is DiagnosisTrade => v in TRADE_CONFIGS;
export const tradeConfig = (id: DiagnosisTrade): TradeConfig => TRADE_CONFIGS[id];

// Friendly aliases the app or a script might send ("ELECTRICIAN", "carpenter").
export function parseTrade(raw: unknown): DiagnosisTrade | null {
  const v = String(raw ?? 'PLUMBING').trim().toUpperCase();
  const alias: Record<string, DiagnosisTrade> = { PLUMBING: 'PLUMBING', PLUMBER: 'PLUMBING', ELECTRICAL: 'ELECTRICAL', ELECTRICIAN: 'ELECTRICAL', CARPENTRY: 'CARPENTRY', CARPENTER: 'CARPENTRY', CARPENTER_FURNITURE: 'CARPENTRY', SOLAR: 'SOLAR', SOLAR_INVERTER: 'SOLAR', INSTALLER: 'SOLAR', BUILDING: 'BUILDING', BRICKLAYER: 'BUILDING', MASON: 'BUILDING', TILER: 'BUILDING', TILING: 'BUILDING', ROOFER: 'BUILDING', ROOFING: 'BUILDING', HVAC: 'HVAC', AC: 'HVAC', AC_TECHNICIAN: 'HVAC' };
  return alias[v] ?? null;
}

export interface TradeRollout { live: string[]; beta: string[]; betaPhones: string[] }
export interface ArtisanLite { phone: string; verificationTier: number; trades?: { trade: string }[] }
export type TradeAccess = { ok: true; beta: boolean } | { ok: false; error: string; code: 'NOT_AVAILABLE' | 'BETA_ONLY' | 'NEEDS_TRADE' | 'NEEDS_VERIFICATION' };

const last10 = (p: string) => p.replace(/\D/g, '').slice(-10);

// Who may run a diagnosis for a trade, and why not. Server-enforced; the app only mirrors it.
export function tradeAccess(cfg: TradeConfig, a: ArtisanLite, rollout: TradeRollout): TradeAccess {
  const live = rollout.live.includes(cfg.id);
  const beta = !live && rollout.beta.includes(cfg.id);
  if (!live && !beta) return { ok: false, code: 'NOT_AVAILABLE', error: `${cfg.label} diagnosis is not available yet.` };
  if (beta && !rollout.betaPhones.map(last10).includes(last10(a.phone))) return { ok: false, code: 'BETA_ONLY', error: `${cfg.label} diagnosis is being tested with a small group and will open soon.` };
  const qualifying = cfg.artisanTrades ?? [cfg.artisanTrade];
  if (cfg.requiresTrade && !(a.trades ?? []).some((t) => qualifying.includes(t.trade))) return { ok: false, code: 'NEEDS_TRADE', error: `Add ${tradeLabelOnProfile(cfg)} to your trades on the Profile tab to use ${cfg.label.toLowerCase()} diagnosis.` };
  if (cfg.requiresVerified && a.verificationTier < 1) return { ok: false, code: 'NEEDS_VERIFICATION', error: `Verify your NIN or BVN on the Profile tab first. ${cfg.label} diagnosis is for verified ${cfg.people}.` };
  return { ok: true, beta };
}
const PROFILE_LABEL: Record<string, string> = { ELECTRICIAN: 'Electrician', PLUMBER: 'Plumber', CARPENTER_FURNITURE: 'Carpenter / Furniture', SOLAR_INVERTER: 'Solar & Inverter', BRICKLAYER: 'Bricklayer / Mason', TILER: 'Tiler / Marble', ROOFER: 'Roofer', AC_TECHNICIAN: 'AC Technician' };
// "Electrician", or for a trade that several profile trades qualify for: "Bricklayer / Mason, Tiler / Marble or Roofer".
const tradeLabelOnProfile = (cfg: TradeConfig) => {
  const names = (cfg.artisanTrades ?? [cfg.artisanTrade]).map((t) => PROFILE_LABEL[t] ?? cfg.label);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
};
