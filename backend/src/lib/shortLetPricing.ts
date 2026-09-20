// Pure pricing/date math for short-let stays — shared by the quote and
// booking endpoints so a guest is always quoted exactly what they'll be
// charged. Weekly rate (if the property has one) is applied to every full
// 7-night block, with any remainder priced per night.

export interface ShortLetRateInput {
  nightlyRate: number;
  weeklyRate?: number | null;
}

export interface ShortLetQuote {
  nights: number;
  rateType: 'NIGHTLY' | 'WEEKLY';
  weeks: number;
  extraNights: number;
  totalAmount: number;
}

const MS_PER_NIGHT = 24 * 60 * 60 * 1000;

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
}

export function quoteStay(rates: ShortLetRateInput, checkIn: Date, checkOut: Date): ShortLetQuote {
  validateStayDates(checkIn, checkOut);
  const nights = nightsBetween(checkIn, checkOut);

  if (rates.weeklyRate && nights >= 7) {
    const weeks = Math.floor(nights / 7);
    const extraNights = nights % 7;
    return {
      nights,
      rateType: 'WEEKLY',
      weeks,
      extraNights,
      totalAmount: weeks * rates.weeklyRate + extraNights * rates.nightlyRate,
    };
  }

  return {
    nights,
    rateType: 'NIGHTLY',
    weeks: 0,
    extraNights: nights,
    totalAmount: nights * rates.nightlyRate,
  };
}

// Two [checkIn, checkOut) ranges overlap unless one ends before the other starts.
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
