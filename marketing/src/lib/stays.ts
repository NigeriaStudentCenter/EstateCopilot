// Shared bits for the stays marketplace (listing cards, booking form, the
// guest's booking page and the Student Housing Hub).

export interface StayListing {
  id: string;
  title: string;
  address: string;
  state: string;
  lga: string;
  propertyType: 'LONG_TERM' | 'SHORT_LET';
  rentAmount: number;
  nightlyRate?: number;
  weeklyRate?: number;
  monthlyRate?: number | null;
  sessionRate?: number | null;
  cautionDepositAmount?: number;
  stayUnitType?: 'ENTIRE_PLACE' | 'PRIVATE_ROOM' | 'SHARED_ROOM' | null;
  studentFriendly?: boolean;
  dailyStays?: boolean;
  nearUniversity?: string | null;
  distanceToCampusKm?: number | null;
  genderPolicy?: 'ANY' | 'FEMALE_ONLY' | 'MALE_ONLY';
  maxGuests?: number | null;
  amenities?: string[];
  safetyFeatures?: string[];
  safetyScore?: number;
  safetyInspectedAt?: string | null;
  safetyInspectedBy?: string | null;
  houseRules?: string | null;
  ratingAvg?: number | null;
  reviewCount?: number;
  completedStays?: number;
  listingDescription?: string;
  imageUrls?: string[];
}

export const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

export const UNIT_LABEL: Record<string, string> = { ENTIRE_PLACE: 'Entire place', PRIVATE_ROOM: 'Private room', SHARED_ROOM: 'Shared room' };
export const GENDER_LABEL: Record<string, string> = { FEMALE_ONLY: 'Female only', MALE_ONLY: 'Male only' };
export const RATE_LABEL: Record<string, string> = {
  NIGHTLY: 'Nightly rate applied',
  WEEKLY: 'Weekly rate applied',
  MONTHLY: 'Monthly rate applied',
  SESSION: 'Academic-session price applied',
};

export const studentsOnly = (p: StayListing) => p.studentFriendly === true && p.dailyStays === false;

export function stars(n: number | null | undefined): string {
  if (!n) return '';
  const full = Math.round(n);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
