// In-memory (MOCK_MODE only) store for short-let stay bookings.

import { rangesOverlap } from './shortLetPricing.js';

export interface MockShortLetBooking {
  id: string;
  propertyId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  nights: number;
  rateType: 'NIGHTLY' | 'WEEKLY';
  totalAmount: number;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  paymentRef?: string;
  paymentLink?: string;
  createdAt: string;
}

export const mockShortLetBookings: MockShortLetBooking[] = [];

export function createMockShortLetBooking(
  data: Omit<MockShortLetBooking, 'id' | 'status' | 'createdAt'>,
): MockShortLetBooking {
  const booking: MockShortLetBooking = {
    id: `slb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: 'PENDING_PAYMENT',
    createdAt: new Date().toISOString(),
    ...data,
  };
  mockShortLetBookings.push(booking);
  return booking;
}

// A PENDING_PAYMENT row blocks the range too (not just CONFIRMED) — otherwise
// two guests could both be quoted the same nights while the first one's
// payment link is still open. Stale PENDING_PAYMENT rows aren't auto-expired
// yet (a follow-up would TTL them after ~30 min), so today an abandoned
// checkout can hold dates until a landlord manually cancels it.
export function isRangeAvailable(propertyId: string, checkIn: Date, checkOut: Date, excludeBookingId?: string): boolean {
  return !mockShortLetBookings.some(
    (b) =>
      b.propertyId === propertyId &&
      b.id !== excludeBookingId &&
      (b.status === 'PENDING_PAYMENT' || b.status === 'CONFIRMED') &&
      rangesOverlap(checkIn, checkOut, new Date(b.checkIn), new Date(b.checkOut)),
  );
}

export function blockedRangesFor(propertyId: string): { checkIn: string; checkOut: string }[] {
  return mockShortLetBookings
    .filter((b) => b.propertyId === propertyId && (b.status === 'PENDING_PAYMENT' || b.status === 'CONFIRMED'))
    .map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut }));
}

// Demo data so a fresh MOCK_MODE boot already has something on the landlord
// calendar and a "these dates are taken" case to show on the public listing.
function daysFromNow(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

mockShortLetBookings.push(
  {
    id: 'slb_demo_1',
    propertyId: 'p2',
    guestName: 'Tobi Adeyemi',
    guestPhone: '+2348030000021',
    guestEmail: 'tobi.demo@example.com',
    checkIn: daysFromNow(4),
    checkOut: daysFromNow(7),
    nights: 3,
    rateType: 'NIGHTLY',
    totalAmount: 225000,
    status: 'CONFIRMED',
    paymentRef: 'demo_ref_slb_1',
    createdAt: daysFromNow(-2),
  },
  {
    id: 'slb_demo_2',
    propertyId: 'p5',
    guestName: 'Ifeoma Chukwu',
    guestPhone: '+2348030000022',
    guestEmail: 'ifeoma.demo@example.com',
    checkIn: daysFromNow(10),
    checkOut: daysFromNow(17),
    nights: 7,
    rateType: 'WEEKLY',
    totalAmount: 360000,
    status: 'CONFIRMED',
    paymentRef: 'demo_ref_slb_2',
    createdAt: daysFromNow(-1),
  },
);
