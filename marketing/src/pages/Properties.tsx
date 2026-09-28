import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { agentApi, getAgentCode } from '../lib/agent';
import PropertyGallery from '../components/PropertyGallery';
import StateSelect from '../components/StateSelect';
import WhatsAppOptIn, { WHATSAPP_OPT_IN_TEXT } from '../components/WhatsAppOptIn';

interface Property {
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
  stayUnitType?: 'ENTIRE_PLACE' | 'PRIVATE_ROOM' | 'SHARED_ROOM' | null;
  studentFriendly?: boolean;
  dailyStays?: boolean; // false = students only
  nearUniversity?: string | null;
  maxGuests?: number | null;
  amenities?: string[];
  listingDescription?: string;
  imageUrls?: string[];
}

const UNIT_LABEL: Record<string, string> = { ENTIRE_PLACE: 'Entire place', PRIVATE_ROOM: 'Private room', SHARED_ROOM: 'Shared room' };

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

type SharingAgent = { code: string; name: string; agencyName: string | null };

const BookingForm: React.FC<{ property: Property; onClose: () => void; agent?: SharingAgent | null }> = ({ property, onClose, agent }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [waOptIn, setWaOptIn] = useState(false);
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
      await api.bookPropertyViewing(property.id, { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, scheduledFor, notes: notes.trim() || undefined, agentCode: agent?.code });
      if (waOptIn) {
        api
          .captureWhatsAppConsent({
            phone: phone.trim(),
            brand: 'ESTATECOPILOT',
            source: 'listing_form',
            optInText: WHATSAPP_OPT_IN_TEXT,
            marketingOptIn: true,
          })
          .catch(() => {});
      }
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
            <p className="text-sm text-gray-600 mb-6">
              {agent
                ? `We've sent your request to ${agent.name}${agent.agencyName ? ` (${agent.agencyName})` : ''} — expect a call or WhatsApp message to arrange the viewing.`
                : "We've notified the landlord's team — expect a call or WhatsApp message to confirm the time."}
            </p>
            <button onClick={onClose} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 className="font-semibold text-gray-900 mb-1">Book a viewing</h3>
            <p className="text-sm text-gray-500 mb-4">{property.title}</p>
            {agent && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
                Your agent: <strong>{agent.name}</strong>{agent.agencyName ? ` · ${agent.agencyName}` : ''}
              </p>
            )}
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
              <WhatsAppOptIn checked={waOptIn} onChange={setWaOptIn} />
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

function formatDateRange(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const ShortLetBookingForm: React.FC<{ property: Property; onClose: () => void }> = ({ property, onClose }) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [blockedRanges, setBlockedRanges] = useState<{ checkIn: string; checkOut: string }[]>([]);
  const [quote, setQuote] = useState<{ nights: number; rateType: 'NIGHTLY' | 'WEEKLY' | 'MONTHLY'; totalAmount: number } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [waOptIn, setWaOptIn] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  // Every guest is checked against BVN or NIN before any payment link.
  const [idType, setIdType] = useState<'BVN' | 'NIN'>('NIN');
  const [idNumber, setIdNumber] = useState('');
  // Student stays (student-friendly listings): request to book with a student ID.
  const studentsOnly = property.studentFriendly === true && property.dailyStays === false;
  const [isStudent, setIsStudent] = useState(studentsOnly);
  const [institution, setInstitution] = useState(property.nearUniversity?.split(',')[0] ?? '');
  const [studentIdFile, setStudentIdFile] = useState<File | null>(null);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    api.getShortLetAvailability(property.id).then(setBlockedRanges).catch(() => {});
  }, [property.id]);

  async function handleCheckAvailability(e: React.FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut) return;
    setQuoting(true);
    setQuoteError(null);
    setQuote(null);
    try {
      const q = await api.getShortLetQuote(property.id, checkIn, checkOut);
      setQuote(q);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Could not check those dates — try again');
    } finally {
      setQuoting(false);
    }
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!quote || !guestName.trim() || !guestPhone.trim() || !guestEmail.trim()) return;
    if (idNumber.replace(/\D/g, '').length !== 11) {
      setBookError(`Your ${idType} is 11 digits.`);
      return;
    }
    if (isStudent && (!institution.trim() || !studentIdFile)) {
      setBookError('Add your school and a photo of your student ID card.');
      return;
    }
    setBooking(true);
    setBookError(null);
    try {
      const form = new FormData();
      form.append('checkIn', checkIn);
      form.append('checkOut', checkOut);
      form.append('guestName', guestName.trim());
      form.append('guestPhone', guestPhone.trim());
      form.append('guestEmail', guestEmail.trim());
      form.append('idType', idType);
      form.append('idNumber', idNumber.replace(/\D/g, ''));
      if (isStudent) {
        form.append('purpose', 'STUDENT');
        form.append('studentInstitution', institution.trim());
        if (studentIdFile) form.append('studentId', studentIdFile);
      }
      const res = await api.bookShortLet(property.id, form);
      if (waOptIn) {
        api
          .captureWhatsAppConsent({
            phone: guestPhone.trim(),
            brand: 'ESTATECOPILOT',
            source: 'short_let_booking_form',
            optInText: WHATSAPP_OPT_IN_TEXT,
            marketingOptIn: true,
          })
          .catch(() => {});
      }
      if (res.paymentLink) {
        window.location.href = res.paymentLink;
      } else {
        setRequested(true);
        setBooking(false);
      }
    } catch (err) {
      setBookError(err instanceof Error ? err.message : 'Booking failed — please try again');
      setBooking(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 mb-1">Book your stay</h3>
        <p className="text-sm text-gray-500 mb-4">{property.title}</p>

        {requested ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">Request sent — your dates are held</p>
              <p className="mt-1">The host is checking your student ID. Once they approve, we'll email a payment link to <strong>{guestEmail}</strong>. Your stay is confirmed when payment clears.</p>
            </div>
            <button onClick={onClose} className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium">Done</button>
          </div>
        ) : (<>

        {blockedRanges.length > 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Currently unavailable: {blockedRanges.map((r) => `${formatDateRange(r.checkIn)}–${formatDateRange(r.checkOut)}`).join(', ')}
          </p>
        )}

        <form onSubmit={handleCheckAvailability} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">
              Check in
              <input
                value={checkIn}
                onChange={(e) => { setCheckIn(e.target.value); setQuote(null); }}
                type="date"
                required
                min={todayIso}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-gray-500">
              Check out
              <input
                value={checkOut}
                onChange={(e) => { setCheckOut(e.target.value); setQuote(null); }}
                type="date"
                required
                min={checkIn || todayIso}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
          {quoteError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{quoteError}</p>}
          {!quote && (
            <button
              type="submit"
              disabled={quoting || !checkIn || !checkOut}
              className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
            >
              {quoting ? 'Checking…' : 'Check availability & price'}
            </button>
          )}
        </form>

        {quote && (
          <>
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">
                {quote.nights} night{quote.nights === 1 ? '' : 's'} available — {currencyFormatter.format(quote.totalAmount)} total
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">{quote.rateType === 'MONTHLY' ? 'Monthly rate applied' : quote.rateType === 'WEEKLY' ? 'Weekly rate applied' : 'Nightly rate applied'}</p>
            </div>

            <form onSubmit={handleBook} className="space-y-3 mt-4">
              {bookError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{bookError}</p>}
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your full name" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="Phone (WhatsApp)" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} type="email" placeholder="Email" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />

              <fieldset className="border border-gray-200 rounded-lg p-3 space-y-2">
                <legend className="text-xs font-semibold text-gray-700 px-1">Verify your identity</legend>
                <p className="text-xs text-gray-500">Every guest on EstateCopilot is checked against their BVN or NIN. We confirm it matches your name — we never store the number or show it to the host.</p>
                <div className="flex gap-2">
                  <select value={idType} onChange={(e) => setIdType(e.target.value as 'BVN' | 'NIN')} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
                    <option value="NIN">NIN</option>
                    <option value="BVN">BVN</option>
                  </select>
                  <input value={idNumber} onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" placeholder={`11-digit ${idType}`} required className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm tracking-wider" />
                </div>
                <p className="text-[11px] text-gray-400">Use your name exactly as it appears on your {idType === 'BVN' ? 'bank records' : 'NIN slip'}.</p>
              </fieldset>

              {property.studentFriendly && (
                <fieldset className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 space-y-2">
                  {studentsOnly ? (
                    <p className="text-sm font-medium text-indigo-900">🎓 Students only — add your school and student ID</p>
                  ) : (
                    <label className="flex items-center gap-2 text-sm font-medium text-indigo-900">
                      <input type="checkbox" checked={isStudent} onChange={(e) => setIsStudent(e.target.checked)} />
                      I'm a student
                    </label>
                  )}
                  {isStudent && (
                    <>
                      <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="School (e.g. UNILAG, YABATECH)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
                      <label className="block text-xs text-gray-600">
                        Photo of your student ID card
                        <input type="file" accept="image/*,application/pdf" onChange={(e) => setStudentIdFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
                      </label>
                      <p className="text-[11px] text-indigo-800">Student stays are request-to-book: the host checks your student ID first, then you get a payment link by email. Only the host sees the card.</p>
                    </>
                  )}
                </fieldset>
              )}

              <WhatsAppOptIn checked={waOptIn} onChange={setWaOptIn} />
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
                <button type="submit" disabled={booking} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {booking ? (isStudent ? 'Sending…' : 'Verifying…') : isStudent ? 'Request to book' : `Verify & pay ${currencyFormatter.format(quote.totalAmount)}`}
                </button>
              </div>
            </form>
          </>
        )}
        </>)}
      </div>
    </div>
  );
};

const Properties: React.FC<{ staysMode?: boolean }> = ({ staysMode = false }) => {
  const { stateSlug } = useParams<{ stateSlug?: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kind = params.get('student') === '1' ? 'student' : staysMode || params.get('stays') === '1' ? 'stays' : 'all';
  const unit = params.get('unit') ?? '';
  const near = params.get('near') ?? '';
  const [nearDraft, setNearDraft] = useState(near);
  function setFilter(next: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    setParams(p, { replace: true });
  }
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Property | null>(null);
  const [stateName, setStateName] = useState<string | null>(null);
  const search = params;
  const highlightId = search.get('listing');
  const [agent, setAgent] = useState<SharingAgent | null>(null);

  // Opened from an agent's share link (captured in App): show who shared it,
  // and route viewing requests to them.
  useEffect(() => {
    const code = getAgentCode();
    if (code) agentApi.byCode(code).then(setAgent).catch(() => setAgent(null));
  }, []);

  // Deep link to one listing: bring it to the top of the grid.
  const ordered = highlightId
    ? [...properties].sort((a, b) => (a.id === highlightId ? -1 : b.id === highlightId ? 1 : 0))
    : properties;

  useEffect(() => {
    setLoading(true);
    api.getProperties(stateSlug, { stays: kind === 'stays', student: kind === 'student', unit: unit || undefined, near: near || undefined })
      .then((data) => setProperties(data as Property[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load listings'))
      .finally(() => setLoading(false));
    if (stateSlug) {
      api.getStates().then((states) => setStateName(states.find((s) => s.slug === stateSlug)?.name ?? null));
    } else {
      setStateName(null);
    }
  }, [stateSlug, kind, unit, near]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
      <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">{kind === 'all' ? 'Vacant properties' : kind === 'student' ? 'Student stays' : 'Daily stays'}</p>
      <h1 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-3">
        {kind === 'student'
          ? `Rooms and short stays for students${stateName ? ` in ${stateName}` : ''}`
          : kind === 'stays'
            ? `Book a stay by the night, week or month${stateName ? ` in ${stateName}` : ''}`
            : stateName ? `Available now in ${stateName}` : 'Available now, listed by verified landlords'}
      </h1>
      {kind !== 'all' && (
        <p className="text-sm text-gray-600 max-w-2xl mb-3">Every guest is verified with their BVN or NIN before a booking is taken — so hosts know exactly who is staying.</p>
      )}
      {kind === 'all' && <p className="text-gray-600 max-w-2xl mb-6">
        {agent
          ? 'Pick a time that works and request a viewing — your agent gets it instantly and will arrange it with you.'
          : "Pick a time that works and request a viewing — the landlord's team gets notified instantly and will confirm directly with you."}
      </p>}
      {search.get('paid') === 'agent-fee' && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg px-4 py-3 mb-6">
          ✓ Thank you — your agent fee payment was received. Your agent and landlord have been notified.
        </div>
      )}
      {agent && (
        <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3 mb-6 text-sm text-gray-700 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center justify-center">{agent.name.charAt(0)}</span>
          <span>
            Shared with you by <strong>{agent.name}</strong>{agent.agencyName ? ` of ${agent.agencyName}` : ''}. Viewing requests go straight to them.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([['all', 'All listings'], ['stays', 'Daily stays'], ['student', 'Student stays']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => k === 'all' && staysMode ? navigate(stateSlug ? `/properties/${stateSlug}` : '/properties') : setFilter({ stays: k === 'stays' ? '1' : null, student: k === 'student' ? '1' : null, ...(k === 'all' ? { unit: null, near: null } : {}) })}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border ${kind === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
          >
            {label}
          </button>
        ))}
        {kind !== 'all' && (
          <>
            <select value={unit} onChange={(e) => setFilter({ unit: e.target.value || null })} className="border border-gray-300 rounded-full px-3 py-1.5 text-sm bg-white">
              <option value="">Any room type</option>
              <option value="ENTIRE_PLACE">Entire place</option>
              <option value="PRIVATE_ROOM">Private room</option>
              <option value="SHARED_ROOM">Shared room</option>
            </select>
            <form onSubmit={(e) => { e.preventDefault(); setFilter({ near: nearDraft.trim() || null }); }} className="flex">
              <input value={nearDraft} onChange={(e) => setNearDraft(e.target.value)} placeholder={kind === 'student' ? 'Near school (e.g. UNILAG)' : 'Area or school'} className="border border-gray-300 rounded-l-full px-3 py-1.5 text-sm w-48" />
              <button className="border border-l-0 border-gray-300 rounded-r-full px-3 text-sm bg-white hover:bg-gray-50">Search</button>
            </form>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-10">
        <span className="text-xs font-medium text-gray-500 uppercase">Filter by state</span>
        <StateSelect
          value={stateSlug ?? ''}
          onChange={(slug) => navigate({ pathname: slug ? `/properties/${slug}` : staysMode ? '/stays' : '/properties', search: params.toString() })}
          countKey="propertyCount"
        />
        {stateSlug && (
          <Link to={`/handymen/${stateSlug}`} className="text-sm text-emerald-700 hover:underline">
            View artisans in {stateName ?? 'this state'} →
          </Link>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading listings…</p>
      ) : properties.length === 0 ? (
        <div className="border border-gray-200 rounded-xl p-12 text-center text-gray-500">
          {kind === 'all' ? 'No properties are listed publicly right now — check back soon.' : 'No stays match those filters yet — try another area or room type.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ordered.map((p) => (
            <div key={p.id} className={`bg-white border shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition flex flex-col ${p.id === highlightId ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-100'}`}>
              <PropertyGallery images={p.imageUrls} alt={p.title} />
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${p.propertyType === 'LONG_TERM' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                    {p.propertyType === 'LONG_TERM' ? 'Long-term lease' : 'Short-let'}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {p.propertyType === 'SHORT_LET' && p.nightlyRate
                      ? `${currencyFormatter.format(p.nightlyRate)}/night`
                      : `${currencyFormatter.format(p.rentAmount)}/yr`}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{p.title}</h3>
                <p className="text-sm text-gray-500 mb-3">{p.address}, {p.lga}</p>
                {p.propertyType === 'SHORT_LET' && (p.stayUnitType || p.studentFriendly || p.monthlyRate) && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {p.stayUnitType && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{UNIT_LABEL[p.stayUnitType]}{p.maxGuests ? ` · up to ${p.maxGuests}` : ''}</span>}
                    {p.studentFriendly && <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800">🎓 {p.dailyStays === false ? 'Students only' : 'Students welcome'}{p.nearUniversity ? ` · near ${p.nearUniversity}` : ''}</span>}
                    {p.monthlyRate ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-800">{currencyFormatter.format(p.monthlyRate)}/month</span> : null}
                  </div>
                )}
                {p.amenities && p.amenities.length > 0 && (
                  <p className="text-xs text-gray-500 mb-3">{p.amenities.slice(0, 5).join(' · ')}</p>
                )}
                {p.listingDescription && <p className="text-sm text-gray-600 mb-4 flex-1">{p.listingDescription}</p>}
                <button
                  onClick={() => setBooking(p)}
                  className="mt-auto bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  {p.propertyType === 'SHORT_LET' ? (p.studentFriendly && p.dailyStays === false ? 'Request to book' : 'Book your stay') : 'Book a viewing'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {booking && (
        booking.propertyType === 'SHORT_LET'
          ? <ShortLetBookingForm property={booking} onClose={() => setBooking(null)} />
          : <BookingForm property={booking} onClose={() => setBooking(null)} agent={agent} />
      )}
    </div>
  );
};

export default Properties;
