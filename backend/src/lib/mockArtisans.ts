// In-memory artisan accounts for MOCK_MODE — mirrors the Prisma models in
// shape so the routes can switch on env.mockMode without special-casing fields.
import type { TradeId } from './trades.js';

export interface MockArtisanTrade {
  id: string;
  trade: TradeId;
  yearsExperience: number;
  isPrimary: boolean;
}
export interface MockArtisanCredential {
  id: string;
  kind: 'NIN' | 'BVN' | 'REFERENCE' | 'SITE_VISIT';
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  resolvedName?: string;
  evidenceUrl?: string;
  verifiedAt?: string;
  createdAt: string;
}
export interface MockWorkSample {
  id: string;
  imageUrl: string;
  caption?: string;
  trade?: TradeId;
  createdAt: string;
}
export interface MockArtisan {
  id: string;
  phone: string;
  name: string;
  businessName?: string;
  bio?: string;
  photoUrl?: string;
  baseState: string;
  baseLga: string;
  coverageLgas: string[];
  skillLevel: 'HAND' | 'TRADESMAN' | 'MASTER';
  availability: 'OPEN' | 'BUSY' | 'AWAY';
  verificationTier: number;
  isListed: boolean;
  score: number;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  createdAt: string;
  lastActiveAt: string;
  trades: MockArtisanTrade[];
  credentials: MockArtisanCredential[];
  workSamples: MockWorkSample[];
}

export const mockArtisans = new Map<string, MockArtisan>(); // id -> artisan
export const mockArtisansByPhone = new Map<string, string>(); // phone -> id

export function createMockArtisan(data: { phone: string; name: string; baseState: string; baseLga: string }): MockArtisan {
  const now = new Date().toISOString();
  const a: MockArtisan = {
    id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    coverageLgas: [],
    skillLevel: 'TRADESMAN',
    availability: 'OPEN',
    verificationTier: 0,
    isListed: false,
    score: 0,
    ratingAvg: 0,
    ratingCount: 0,
    jobsCompleted: 0,
    createdAt: now,
    lastActiveAt: now,
    trades: [],
    credentials: [],
    workSamples: [],
    ...data,
  };
  mockArtisans.set(a.id, a);
  mockArtisansByPhone.set(a.phone, a.id);
  return a;
}

export function seedDemoArtisan(): void {
  if (mockArtisansByPhone.has('2348030001111')) return;
  const a = createMockArtisan({ phone: '2348030001111', name: 'Emeka, Yaba Sparks', baseState: 'Lagos', baseLga: 'Eti-Osa' });
  a.businessName = 'Yaba Sparks Electrical';
  a.bio = '12 years on residential wiring, DBs and fault-finding across Lagos mainland.';
  a.coverageLgas = ['Eti-Osa', 'Ikeja'];
  a.verificationTier = 1;
  a.isListed = true;
  a.score = 71;
  a.ratingAvg = 4.6;
  a.ratingCount = 18;
  a.jobsCompleted = 22;
  a.trades = [
    { id: 't1', trade: 'ELECTRICIAN', yearsExperience: 12, isPrimary: true },
    { id: 't2', trade: 'SOLAR_INVERTER', yearsExperience: 4, isPrimary: false },
  ];
  a.credentials = [
    { id: 'c1', kind: 'NIN', status: 'VERIFIED', resolvedName: 'Emeka Obi', verifiedAt: a.createdAt, createdAt: a.createdAt },
  ];
}
