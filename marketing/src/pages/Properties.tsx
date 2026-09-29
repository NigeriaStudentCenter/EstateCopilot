import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { agentApi, getAgentCode } from '../lib/agent';
import PropertyGallery from '../components/PropertyGallery';
import StateSelect from '../components/StateSelect';
import WhatsAppOptIn, { WHATSAPP_OPT_IN_TEXT } from '../components/WhatsAppOptIn';
import StayBookingForm from '../components/StayBookingForm';
import { GENDER_LABEL, UNIT_LABEL, stars, type StayListing } from '../lib/stays';

type Property = StayListing;


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

const Properties: React.FC<{ staysMode?: boolean }> = ({ staysMode = false }) => {
  const { stateSlug } = useParams<{ stateSlug?: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kind = params.get('student') === '1' ? 'student' : staysMode || params.get('stays') === '1' ? 'stays' : 'all';
  const unit = params.get('unit') ?? '';
  const near = params.get('near') ?? '';
  const gender = params.get('gender') ?? '';
  const inspected = params.get('inspected') === '1';
  const maxKm = Number(params.get('maxKm')) || 0;
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
    api.getProperties(stateSlug, {
      stays: kind === 'stays',
      student: kind === 'student',
      unit: unit || undefined,
      near: near || undefined,
      gender: kind === 'student' ? gender || undefined : undefined,
      inspected: kind === 'student' && inspected,
      maxKm: kind === 'student' ? maxKm || undefined : undefined,
    })
      .then((data) => setProperties(data as Property[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load listings'))
      .finally(() => setLoading(false));
    if (stateSlug) {
      api.getStates().then((states) => setStateName(states.find((s) => s.slug === stateSlug)?.name ?? null));
    } else {
      setStateName(null);
    }
  }, [stateSlug, kind, unit, near, gender, inspected, maxKm]);

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
        <p className="text-sm text-gray-600 max-w-2xl mb-3">Every guest gives a BVN or NIN for an identity check before a booking is taken — so hosts know exactly who is staying.</p>
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

      {kind === 'student' && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select value={gender} onChange={(e) => setFilter({ gender: e.target.value || null })} className="border border-gray-300 rounded-full px-3 py-1.5 text-sm bg-white">
              <option value="">Any hostel</option>
              <option value="FEMALE_ONLY">Female only</option>
              <option value="MALE_ONLY">Male only</option>
            </select>
            <select value={maxKm || ''} onChange={(e) => setFilter({ maxKm: e.target.value || null })} className="border border-gray-300 rounded-full px-3 py-1.5 text-sm bg-white">
              <option value="">Any distance to campus</option>
              <option value="1">Within 1 km</option>
              <option value="2">Within 2 km</option>
              <option value="5">Within 5 km</option>
            </select>
            <label className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border cursor-pointer ${inspected ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300'}`}>
              <input type="checkbox" className="sr-only" checked={inspected} onChange={(e) => setFilter({ inspected: e.target.checked ? '1' : null })} />
              ✓ Ambassador-inspected only
            </label>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              ['🪪', 'Verified people', 'Every guest gives a BVN/NIN for an ID check; every student shows a student ID.'],
              ['🔒', 'Caution fee protected', 'Held by EstateCopilot — not the landlord — and returned after you move out.'],
              ['🛡️', 'Safety standards', 'Hosts declare 14 safety checks; Student Ambassadors inspect in person.'],
              ['⭐', 'Real reviews', 'Only students who actually stayed can review.'],
            ].map(([icon, title, body]) => (
              <div key={title} className="bg-white border border-indigo-100 rounded-xl p-3">
                <p className="text-sm font-semibold text-gray-900">{icon} {title}</p>
                <p className="text-xs text-gray-600 mt-1">{body}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600 mb-6">
            New to renting? Read the <Link to="/students" className="text-emerald-700 font-medium hover:underline">Student Housing Hub</Link> — how to avoid scams, what to check before you pay, and how your caution fee is protected.
          </p>
        </>
      )}

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
                {p.propertyType === 'SHORT_LET' && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {p.safetyInspectedAt && <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-600 text-white">✓ Ambassador-inspected</span>}
                    {p.ratingAvg ? <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-800">{stars(p.ratingAvg)} {p.ratingAvg} ({p.reviewCount})</span> : null}
                    {p.stayUnitType && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{UNIT_LABEL[p.stayUnitType]}{p.maxGuests ? ` · up to ${p.maxGuests}` : ''}</span>}
                    {p.genderPolicy && p.genderPolicy !== 'ANY' && <span className="px-2 py-0.5 rounded-full text-xs bg-pink-50 text-pink-800">{GENDER_LABEL[p.genderPolicy]}</span>}
                    {p.studentFriendly && <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800">🎓 {p.dailyStays === false ? 'Students only' : 'Students welcome'}{p.nearUniversity ? ` · ${p.distanceToCampusKm != null ? `${p.distanceToCampusKm} km to ` : 'near '}${p.nearUniversity}` : ''}</span>}
                    {p.studentFriendly && typeof p.safetyScore === 'number' && <span className="px-2 py-0.5 rounded-full text-xs bg-sky-50 text-sky-800">🛡️ Safety {p.safetyScore}/100</span>}
                    {p.sessionRate ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-800">{currencyFormatter.format(p.sessionRate)}/session</span> : null}
                    {p.monthlyRate ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-800">{currencyFormatter.format(p.monthlyRate)}/month</span> : null}
                    {p.studentFriendly && p.cautionDepositAmount ? <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-600">🔒 {currencyFormatter.format(p.cautionDepositAmount)} caution fee, protected</span> : null}
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
          ? <StayBookingForm property={booking} onClose={() => setBooking(null)} studentView={kind === 'student'} />
          : <BookingForm property={booking} onClose={() => setBooking(null)} agent={agent} />
      )}
    </div>
  );
};

export default Properties;
