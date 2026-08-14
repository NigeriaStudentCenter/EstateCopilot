import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Booking } from '../types';

const statusStyles: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-gray-100 text-gray-500 line-through',
  COMPLETED: 'bg-blue-100 text-blue-800',
};

const typeStyles: Record<string, { label: string; className: string }> = {
  PROPERTY_VIEWING: { label: 'Property viewing', className: 'bg-emerald-50 text-emerald-800 border border-emerald-200' },
  REPAIR_QUOTE_VISIT: { label: 'Repair site visit', className: 'bg-purple-50 text-purple-800 border border-purple-200' },
};

function groupByDate(bookings: Booking[]): [string, Booking[]][] {
  const groups = new Map<string, Booking[]>();
  for (const b of bookings) {
    const key = new Date(b.scheduledFor).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return Array.from(groups.entries());
}

const BookingsPage: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    api.getBookings()
      .then((data) => setBookings(data as Booking[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to reach the backend'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleStatus(id: string, status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED') {
    setBusyId(id);
    try {
      await api.setBookingStatus(id, status);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading bookings…</div>;

  const groups = groupByDate(bookings);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Bookings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Every property viewing and repair site-visit request from the public site, in one calendar — confirm or
          cancel as they come in. You're also notified over WhatsApp/email the moment each one is submitted.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      {groups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 text-center text-sm text-gray-500">
          No bookings yet — they'll show up here the moment someone books a viewing or a repair visit.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([date, items]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{date}</h3>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
                {items.map((b) => (
                  <div key={b.id} className="px-6 py-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">
                          {new Date(b.scheduledFor).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeStyles[b.type].className}`}>
                          {typeStyles[b.type].label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[b.status]}`}>
                          {b.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{b.label}</p>
                      <p className="text-xs text-gray-500 mt-1">{b.requesterName} · {b.requesterPhone}{b.requesterEmail ? ` · ${b.requesterEmail}` : ''}</p>
                      {b.notes && <p className="text-xs text-gray-400 italic mt-1">"{b.notes}"</p>}
                    </div>
                    {b.status === 'REQUESTED' && (
                      <div className="shrink-0 flex gap-2">
                        <button
                          onClick={() => handleStatus(b.id, 'CONFIRMED')}
                          disabled={busyId === b.id}
                          className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleStatus(b.id, 'CANCELLED')}
                          disabled={busyId === b.id}
                          className="text-xs font-medium border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BookingsPage;
