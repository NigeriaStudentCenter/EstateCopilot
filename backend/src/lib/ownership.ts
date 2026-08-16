// MOCK_MODE-only helpers that resolve which landlord owns a given resource,
// by walking propertyId/tenancyId/maintenanceTicketId chains back to
// Property.landlordId. Every landlord-authenticated route uses these to
// scope what a logged-in landlord can see or mutate — without them, every
// landlord shares one global pool of everyone's data (the bug this file
// exists to close). Prisma (real) mode doesn't need an equivalent: the same
// walk is expressed directly as a relation `where` filter in each route.

import { MOCK_PROPERTIES } from './mockProperties.js';
import { MOCK_TENANCIES } from './mockTenancies.js';
import { mockTickets } from './mockMaintenance.js';
import { mockQuotes } from './mockBookings.js';

export function propertyLandlordId(propertyId?: string): string | undefined {
  return propertyId ? MOCK_PROPERTIES.find((p) => p.id === propertyId)?.landlordId : undefined;
}

export function tenancyLandlordId(tenancyId?: string): string | undefined {
  if (!tenancyId) return undefined;
  const tenancy = MOCK_TENANCIES.find((t) => t.id === tenancyId);
  return tenancy ? propertyLandlordId(tenancy.propertyId) : undefined;
}

export function ticketLandlordId(ticketId?: string): string | undefined {
  if (!ticketId) return undefined;
  const ticket = mockTickets.find((t) => t.id === ticketId);
  return ticket ? propertyLandlordId(ticket.propertyId) : undefined;
}

// Bookings are tied to a property (viewings) or a maintenance ticket
// (repair site-visits) — never both — so ownership resolves via whichever
// one is actually set.
export function bookingLandlordId(booking: { propertyId?: string; maintenanceTicketId?: string }): string | undefined {
  return booking.propertyId ? propertyLandlordId(booking.propertyId) : ticketLandlordId(booking.maintenanceTicketId);
}

export function quoteLandlordId(quoteId?: string): string | undefined {
  if (!quoteId) return undefined;
  const quote = mockQuotes.find((q) => q.id === quoteId);
  return quote ? ticketLandlordId(quote.maintenanceTicketId) : undefined;
}
