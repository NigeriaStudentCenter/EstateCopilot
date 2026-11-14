import type { Diagnosis, DiagnosisTrade, Vehicle } from '../diagnosisSchema.js';

// Everything that differs between trades lives in one config per trade (prompt, guards, who may use it, mock data).
// Adding a trade = one new file here + one line in index.ts (and a catalogue on the Kolo side).
export interface TradeConfig {
  id: DiagnosisTrade;
  label: string;
  icon: string;
  /** The id of the matching trade on the artisan's profile (lib/trades.ts). */
  artisanTrade: string;
  /** Other profile trades that also qualify (building covers bricklayer, tiler and roofer). Defaults to just artisanTrade. */
  artisanTrades?: string[];
  /** Outcome the model uses when the photo is not this trade. */
  notOutcome: 'NOT_PLUMBING' | 'NOT_ELECTRICAL' | 'NOT_CARPENTRY' | 'NOT_SOLAR' | 'NOT_BUILDING' | 'NOT_HVAC' | 'NOT_AUTOMOTIVE';
  people: string; // "plumbers" / "electricians": used in access messages
  noteLabel: string; // "Plumber's" / "Electrician's"
  intro: string; // shown under the trade picker
  notice?: string; // safety notice on the capture screen
  system: string; // system prompt
  withChecks: boolean; // the model also returns tests / measurements to take
  requiresTrade: boolean; // artisan must list the matching trade on their profile
  requiresVerified: boolean; // artisan must have passed the ID check
  /** Trade guards applied in code on top of the prompt. May tighten (STOP, CAUTION, steps) but never loosen. */
  rules?: (out: Diagnosis, note: string, ctx?: { vehicle?: Vehicle }) => void;
  /** Vehicles: the app collects the vehicle details and a terms acceptance with the photos. */
  needsVehicle?: boolean;
  mock: (input: { note?: string }) => Diagnosis;
}
