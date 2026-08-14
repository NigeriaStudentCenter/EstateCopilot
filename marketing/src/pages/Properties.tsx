import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import PropertyGallery from '../components/PropertyGallery';

interface Property {
  id: string;
  title: string;
  address: string;
  state: string;
  lga: string;
  propertyType: 'LONG_TERM' | 'SHORT_LET';
  rentAmount: number;
  listingDescription?: string;
  imageUrls?: string[];
}

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

const BookingForm: React.FC<{ property: Property; onClose: () => void }> = ({ property, onClose }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !date) return;
    setSubmitting(true);
    setError(null);
    try {
      const scheduledFor = new Date(`${date}T${time}:00`).toISOString();
      await api.bookPropertyViewing(property.id, { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, scheduledFor, notes: notes.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <h3 className="font-semibold text-gray-900 mb-2">Viewing requested</h3>
            <p className="text-sm text-gray-600 mb-6">We've notified the landlord's team — expect a call or WhatsApp message to confirm the time.</p>
            <button onClick={onClose} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 className="font-semibold text-gray-900 mb-1">Book a viewing</h3>
            <p className="text-sm text-gray-500 mb-4">{property.title}</p>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
            <div className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (WhatsApp)" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input value={date} onChange={(e) => setDate(e.target.value)} type="date" required min={new Date().toISOString().slice(0, 10)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <input value={time} onChange={(e) => setTime(e.target.value)} type="time" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else the landlord should know? (optional)" rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {submitting ? 'Booking…' : 'Request viewing'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const Properties: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Property | null>(null);

  useEffect(() => {
    api.getProperties()
      .then((data) => setProperties(data as Property[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load listings'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
      <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">Vacant properties</p>
      <h1 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-3">Available now, listed by verified landlords</h1>
      <p className="text-gray-600 max-w-2xl mb-10">
        Pick a time that works and request a viewing — the landlord's team gets notified instantly and will confirm
        directly with you.
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading listings…</p>
      ) : properties.length === 0 ? (
        <div className="border border-gray-200 rounded-xl p-12 text-center text-gray-500">
          No properties are listed publicly right now — check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((p) => (
            <div key={p.id} className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition flex flex-col">
              <PropertyGallery images={p.imageUrls} alt={p.title} />
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${p.propertyType === 'LONG_TERM' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                    {p.propertyType === 'LONG_TERM' ? 'Long-term lease' : 'Short-let'}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {currencyFormatter.format(p.rentAmount)}{p.propertyType === 'LONG_TERM' && '/yr'}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{p.title}</h3>
                <p className="text-sm text-gray-500 mb-3">{p.address}, {p.lga}</p>
                {p.listingDescription && <p className="text-sm text-gray-600 mb-4 flex-1">{p.listingDescription}</p>}
                <button
                  onClick={() => setBooking(p)}
                  className="mt-auto bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  Book a viewing
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {booking && <BookingForm property={booking} onClose={() => setBooking(null)} />}
    </div>
  );
};

export default Properties;
