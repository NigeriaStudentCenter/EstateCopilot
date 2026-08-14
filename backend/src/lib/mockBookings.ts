// In-memory (MOCK_MODE only) store for bookings (property viewings + repair
// site-visit requests) and handyman quotes.

export interface MockBooking {
  id: string;
  type: 'PROPERTY_VIEWING' | 'REPAIR_QUOTE_VISIT';
  propertyId?: string;
  maintenanceTicketId?: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail?: string;
  scheduledFor: string;
  status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  notes?: string;
  createdAt: string;
}

export interface MockQuote {
  id: string;
  maintenanceTicketId: string;
  handymanName: string;
  handymanPhone: string;
  handymanEmail?: string;
  amount: number;
  message?: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export const mockBookings: MockBooking[] = [];
export const mockQuotes: MockQuote[] = [];

export function createMockBooking(data: Omit<MockBooking, 'id' | 'status' | 'createdAt'>): MockBooking {
  const booking: MockBooking = {
    id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: 'REQUESTED',
    createdAt: new Date().toISOString(),
    ...data,
  };
  mockBookings.push(booking);
  return booking;
}

export function createMockQuote(data: Omit<MockQuote, 'id' | 'status' | 'createdAt'>): MockQuote {
  const quote: MockQuote = {
    id: `qt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: 'SUBMITTED',
    createdAt: new Date().toISOString(),
    ...data,
  };
  mockQuotes.push(quote);
  return quote;
}
