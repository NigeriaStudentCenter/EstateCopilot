import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Property, ShortLetBooking } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

const statusStyles: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-sky-100 text-sky-800',
};

const statusLabels: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Every calendar day this booking's stay covers, as 'YYYY-MM-DD' strings —
// checkOut night itself is excluded (the guest leaves that morning).
function nightsCovered(booking: ShortLetBooking): Set<string> {
  const nights = new Set<string>();
  const cursor = new Date(booking.checkIn);
  const end = new Date(booking.checkOut);
  while (cursor < end) {
    nights.add(isoDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return nights;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const Calendar: React.FC<{ month: Date; bookings: ShortLetBooking[] }> = ({ month, bookings }) => {
  const bookedNights = useMemo(() => {
    const map = new Map<string, ShortLetBooking>();
    for (const b of bookings) {
      if (b.status !== 'CONFIRMED' && b.status !== 'PENDING_PAYMENT') continue;
      for (const day of nightsCovered(b)) map.set(day, b);
    }
    return map;
  }, [bookings]);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Monday-first offset: getDay() is 0=Sun..6=Sat.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;

  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="aspect-square" />;
          const key = isoDateOnly(date);
          const booking = bookedNights.get(key);
          const isPending = booking?.status === 'PENDING_PAYMENT';
          return (
            <div
              key={i}
              title={booking ? `${booking.guestName} — ${statusLabels[booking.status]}` : 'Open'}
              className={`aspect-square rounded-md flex items-center justify-center text-xs font-medium ${
                booking
                  ? isPending
                    ? 'bg-amber-200 text-amber-900'
                    : 'bg-emerald-600 text-white'
                  : 'bg-gray-50 text-gray-400 border border-gray-100'
              }`}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" /> Booked</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-200 inline-block" /> Awaiting payment</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-50 border border-gray-200 inline-block" /> Open</span>
      </div>
    </div>
  );
};

const ShortLetPage: React.FC = () => {
  const [bookings, setBookings] = useState<ShortLetBooking[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  function refresh() {
    Promise.all([api.getShortLetBookings(), api.getProperties()])
      .then(([bookingsData, propertiesData]) => {
        setBookings(bookingsData as ShortLetBooking[]);
        const shortLets = (propertiesData as Property[]).filter((p) => p.propertyType === 'SHORT_LET');
        setProperties(shortLets);
        setSelectedPropertyId((current) => current || shortLets[0]?.id || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to reach the backend'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleStatusChange(bookingId: string, status: 'CANCELLED' | 'COMPLETED') {
    setActingOn(bookingId);
    try {
      await api.setShortLetBookingStatus(bookingId, status);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking');
    } finally {
      setActingOn(null);
    }
  }

  const calendarBookings = bookings.filter((b) => b.propertyId === selectedPropertyId);

  if (loading) return <div className="text-sm text-gray-500">Loading short-let bookings…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Short Lets</h2>
        <p className="text-sm text-gray-600 mt-1">
          Nightly and weekly stay bookings across your short-let properties — guests pay upfront through Paystack,
          and a booking is confirmed automatically the moment that clears.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      {properties.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center text-sm text-gray-500">
          You don't have any short-let properties yet. Add one from the Properties page and mark it "Short-let" to
          start taking bookings here.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white font-medium"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                aria-label="Previous month"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-gray-900 w-36 text-center">{MONTH_FORMATTER.format(viewMonth)}</span>
              <button
                onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>
          <Calendar month={viewMonth} bookings={calendarBookings} />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">All bookings</h3>
        </div>
        {bookings.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">No short-let bookings yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {bookings.map((b) => (
              <li key={b.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">{b.guestName}</p>
                  <p className="text-sm text-gray-500">{b.propertyTitle}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {new Date(b.checkIn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} →{' '}
                    {new Date(b.checkOut).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{b.nights} night{b.nights === 1 ? '' : 's'} · {currencyFormatter.format(b.totalAmount)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{b.guestPhone}{b.guestEmail ? ` · ${b.guestEmail}` : ''}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[b.status]}`}>
                    {statusLabels[b.status]}
                  </span>
                  {(b.status === 'PENDING_PAYMENT' || b.status === 'CONFIRMED') && (
                    <div className="flex gap-2">
                      {b.status === 'CONFIRMED' && (
                        <button
                          onClick={() => handleStatusChange(b.id, 'COMPLETED')}
                          disabled={actingOn === b.id}
                          className="text-xs font-medium text-sky-700 hover:underline disabled:opacity-50"
                        >
                          Mark completed
                        </button>
                      )}
                      <button
                        onClick={() => handleStatusChange(b.id, 'CANCELLED')}
                        disabled={actingOn === b.id}
                        className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ShortLetPage;
