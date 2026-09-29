// Pure pricing/date math for short-let stays — shared by the quote and
// booking endpoints so a guest is always quoted exactly what they'll be
// charged. The cheapest applicable tier wins: a monthly rate (per 28-night
// block — student terms, long stays) for 28+ nights, then a weekly rate for
// every full 7-night block, with any remainder priced per week/night.

export interface ShortLetRateInput {
  nightlyRate: number;
  weeklyRate?: number | null;
  monthlyRate?: number | null;
  sessionRate?: number | null;
}

export interface ShortLetQuote {
  nights: number;
  rateType: 'NIGHTLY' | 'WEEKLY' | 'MONTHLY' | 'SESSION';
  months: number;
  weeks: number;
  extraNights: number;
  totalAmount: number;
}

const MS_PER_NIGHT = 24 * 60 * 60 * 1000;
export const MONTH_NIGHTS = 28;
// An academic session: a flat price for any stay in this range (Nigerian
// hostels are let per session, not per night).
export const SESSION_MIN_NIGHTS = 150;
export const MAX_STAY_NIGHTS = 366;

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / MS_PER_NIGHT);
}

export class InvalidStayError extends Error {}

export function validateStayDates(checkIn: Date, checkOut: Date): void {
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    throw new InvalidStayError('checkIn/checkOut must be valid dates');
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (checkIn < today) {
    throw new InvalidStayError('checkIn cannot be in the past');
  }
  if (nightsBetween(checkIn, checkOut) < 1) {
    throw new InvalidStayError('checkOut must be at least one night after checkIn');
  }
  if (nightsBetween(checkIn, checkOut) > MAX_STAY_NIGHTS) {
    throw new InvalidStayError('Stays are booked one academic session (up to a year) at a time');
  }
}

export function quoteStay(rates: ShortLetRateInput, checkIn: Date, checkOut: Date): ShortLetQuote {
  validateStayDates(checkIn, checkOut);
  const tiered = quoteTiered(rates, nightsBetween(checkIn, checkOut));
  // A session price applies to any stay of a session's length — and only if
  // it's actually the better deal for the student.
  if (rates.sessionRate && tiered.nights >= SESSION_MIN_NIGHTS && rates.sessionRate < tiered.totalAmount) {
    return { nights: tiered.nights, rateType: 'SESSION', months: 0, weeks: 0, extraNights: 0, totalAmount: rates.sessionRate };
  }
  return tiered;
}

function quoteTiered(rates: ShortLetRateInput, nights: number): ShortLetQuote {

  if (rates.monthlyRate && nights >= MONTH_NIGHTS) {
    const months = Math.floor(nights / MONTH_NIGHTS);
    const rest = nights % MONTH_NIGHTS;
    const weeks = rates.weeklyRate ? Math.floor(rest / 7) : 0;
    const extraNights = rest - weeks * 7;
    return {
      nights,
      rateType: 'MONTHLY',
      months,
      weeks,
      extraNights,
      totalAmount: months * rates.monthlyRate + weeks * (rates.weeklyRate ?? 0) + extraNights * rates.nightlyRate,
    };
  }

  if (rates.weeklyRate && nights >= 7) {
    const weeks = Math.floor(nights / 7);
    const extraNights = nights % 7;
    return {
      nights,
      rateType: 'WEEKLY',
      months: 0,
      weeks,
      extraNights,
      totalAmount: weeks * rates.weeklyRate + extraNights * rates.nightlyRate,
    };
  }

  return {
    nights,
    rateType: 'NIGHTLY',
    months: 0,
    weeks: 0,
    extraNights: nights,
    totalAmount: nights * rates.nightlyRate,
  };
}

// Two [checkIn, checkOut) ranges overlap unless one ends before the other starts.
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
