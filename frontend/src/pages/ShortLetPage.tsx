import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Property, ShortLetBooking } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

const statusStyles: Record<string, string> = {
  AWAITING_APPROVAL: 'bg-indigo-100 text-indigo-800',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-sky-100 text-sky-800',
};

const statusLabels: Record<string, string> = {
  AWAITING_APPROVAL: 'Needs your approval',
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
      if (b.status !== 'CONFIRMED' && b.status !== 'PENDING_PAYMENT' && b.status !== 'AWAITING_APPROVAL') continue;
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
          const isPending = booking?.status === 'PENDING_PAYMENT' || booking?.status === 'AWAITING_APPROVAL';
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
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-200 inline-block" /> Held (awaiting payment or your approval)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-50 border border-gray-200 inline-block" /> Open</span>
      </div>
    </div>
  );
};

// Who the guest is: every booking carries a BVN/NIN check result. We only
// ever hold the last 4 digits and the name the registry returned.
const IdBadge: React.FC<{ b: ShortLetBooking }> = ({ b }) =>
  b.idCheck === 'VERIFIED' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
      ✓ {b.idType} verified{b.idVerifiedName ? ` · ${b.idVerifiedName}` : ''}
    </span>
  ) : b.idType ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200" title="ID checks aren't connected yet — confirm the guest's ID at check-in.">
      ⚠ {b.idType} ••••{b.idLast4} · not checked yet
    </span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">No ID on file</span>
  );

const StudentIdViewer: React.FC<{ bookingId: string; onClose: () => void }> = ({ bookingId, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    api.getStudentIdBlob(bookingId)
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setType(blob.type); setUrl(objectUrl); })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the student ID'));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [bookingId]);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Student ID</h3>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">Close</button>
        </div>
        {err ? <p className="text-sm text-red-700">{err}</p>
          : !url ? <p className="text-sm text-gray-500">Loading…</p>
          : type === 'application/pdf' ? <iframe src={url} title="Student ID" className="w-full h-[70vh] rounded" />
          : <img src={url} alt="Student ID card" className="w-full max-h-[70vh] object-contain rounded bg-gray-50" />}
        <p className="text-[11px] text-gray-400 mt-3">Only you can see this. Check the name matches the booking and the card is current.</p>
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
  const [viewingIdFor, setViewingIdFor] = useState<string | null>(null);
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

  async function handleRequest(b: ShortLetBooking, approve: boolean) {
    let reason: string | undefined;
    if (!approve) {
      const r = window.prompt(`Decline ${b.guestName}'s request? Add a short note for them (optional):`, '');
      if (r === null) return;
      reason = r.trim() || undefined;
    }
    setActingOn(b.id);
    try {
      if (approve) await api.approveStayRequest(b.id);
      else await api.declineStayRequest(b.id, reason);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the request');
    } finally {
      setActingOn(null);
    }
  }

  const awaiting = bookings.filter((b) => b.status === 'AWAITING_APPROVAL');
  const calendarBookings = bookings.filter((b) => b.propertyId === selectedPropertyId);

  if (loading) return <div className="text-sm text-gray-500">Loading short-let bookings…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Stays</h2>
        <p className="text-sm text-gray-600 mt-1">
          Nightly, weekly and monthly stays across your short-let properties. Every guest is checked against their BVN or
          NIN before booking; student stays wait for you to approve their student ID. Guests pay upfront through Paystack,
          and a booking is confirmed automatically the moment that clears.
        </p>
      </div>

      {awaiting.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <h3 className="font-semibold text-indigo-900 mb-3">🎓 Student stay requests ({awaiting.length})</h3>
          <ul className="space-y-3">
            {awaiting.map((b) => (
              <li key={b.id} className="bg-white rounded-lg border border-indigo-100 p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900">{b.guestName} <span className="font-normal text-gray-500">· {b.studentInstitution}</span></p>
                  <p className="text-sm text-gray-600">
                    {b.propertyTitle} · {new Date(b.checkIn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} →{' '}
                    {new Date(b.checkOut).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {b.nights} nights · {currencyFormatter.format(b.totalAmount)}
                  </p>
                  <IdBadge b={b} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.hasStudentId && (
                    <button onClick={() => setViewingIdFor(b.id)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 hover:bg-gray-50">View student ID</button>
                  )}
                  <button onClick={() => handleRequest(b, false)} disabled={actingOn === b.id} className="px-3 py-1.5 rounded-lg text-sm border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50">Decline</button>
                  <button onClick={() => handleRequest(b, true)} disabled={actingOn === b.id} className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Approve & send payment link</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {viewingIdFor && <StudentIdViewer bookingId={viewingIdFor} onClose={() => setViewingIdFor(null)} />}

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
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <IdBadge b={b} />
                    {b.purpose === 'STUDENT' && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-800">🎓 Student · {b.studentInstitution}</span>
                    )}
                    {b.hasStudentId && (
                      <button onClick={() => setViewingIdFor(b.id)} className="text-[11px] text-indigo-700 hover:underline">View student ID</button>
                    )}
                    {b.hostNote && <span className="text-[11px] text-gray-500">Your note: {b.hostNote}</span>}
                  </div>
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
