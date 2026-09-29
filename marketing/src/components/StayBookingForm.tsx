import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { naira, RATE_LABEL, stars, studentsOnly, type StayListing } from '../lib/stays';
import WhatsAppOptIn, { WHATSAPP_OPT_IN_TEXT } from './WhatsAppOptIn';

function formatDateRange(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

type Quote = Awaited<ReturnType<typeof api.getShortLetQuote>>;
type Review = Awaited<ReturnType<typeof api.getReviews>>[number];
type SafetyItem = { key: string; label: string; essential: boolean };

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Sibling', 'Uncle / Aunt', 'Sponsor / Scholarship', 'Other'];

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';

// Book a stay. Daily guests: dates -> ID -> pay. Students (student-friendly
// listings): dates -> ID -> school + student ID card -> parent/guardian/
// sponsor (who can pay) -> accept house rules + caution-fee terms -> request.
const StayBookingForm: React.FC<{ property: StayListing; onClose: () => void; studentView?: boolean }> = ({ property, onClose, studentView }) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const onlyStudents = studentsOnly(property);
  const [tab, setTab] = useState<'book' | 'about'>('book');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [blockedRanges, setBlockedRanges] = useState<{ checkIn: string; checkOut: string }[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [waOptIn, setWaOptIn] = useState(false);
  const [idType, setIdType] = useState<'BVN' | 'NIN'>('NIN');
  const [idNumber, setIdNumber] = useState('');

  const [isStudent, setIsStudent] = useState(onlyStudents || Boolean(studentView && property.studentFriendly));
  const [institution, setInstitution] = useState(property.nearUniversity?.split(',')[0] ?? '');
  const [studentIdFile, setStudentIdFile] = useState<File | null>(null);
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorRelationship, setSponsorRelationship] = useState('');
  const [sponsorPhone, setSponsorPhone] = useState('');
  const [sponsorEmail, setSponsorEmail] = useState('');
  const [payer, setPayer] = useState<'GUEST' | 'SPONSOR'>('SPONSOR');
  const [accepted, setAccepted] = useState(false);

  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [requested, setRequested] = useState<{ manageUrl: string } | null>(null);

  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [safety, setSafety] = useState<SafetyItem[]>([]);

  useEffect(() => {
    api.getShortLetAvailability(property.id).then(setBlockedRanges).catch(() => {});
  }, [property.id]);

  useEffect(() => {
    if (tab !== 'about' || reviews) return;
    api.getReviews(property.id).then(setReviews).catch(() => setReviews([]));
    api.getStudentSafety().then(setSafety).catch(() => {});
  }, [tab, reviews, property.id]);

  const deposit = isStudent ? quote?.studentDeposit ?? property.cautionDepositAmount ?? 0 : 0;

  async function handleCheckAvailability(e: React.FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut) return;
    setQuoting(true);
    setQuoteError(null);
    setQuote(null);
    try {
      setQuote(await api.getShortLetQuote(property.id, checkIn, checkOut));
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Could not check those dates — try again');
    } finally {
      setQuoting(false);
    }
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!quote) return;
    const id = idNumber.replace(/\D/g, '');
    if (id.length !== 11) return setBookError(`Your ${idType} is 11 digits.`);
    if (isStudent) {
      if (!institution.trim() || !studentIdFile) return setBookError('Add your school and a photo of your student ID card.');
      if (!sponsorName.trim() || !sponsorRelationship || sponsorPhone.trim().length < 7) return setBookError('Add a parent, guardian or sponsor — they are also your emergency contact.');
      if (payer === 'SPONSOR' && !sponsorEmail.includes('@')) return setBookError('Add your sponsor’s email so we can send them the payment link.');
    }
    if (!accepted) return setBookError('Please accept the house rules and stay agreement.');
    setBooking(true);
    setBookError(null);
    try {
      const form = new FormData();
      const fields: Record<string, string> = {
        checkIn, checkOut,
        guestName: guestName.trim(), guestPhone: guestPhone.trim(), guestEmail: guestEmail.trim(),
        idType, idNumber: id, acceptTerms: 'true',
      };
      if (isStudent) {
        Object.assign(fields, {
          purpose: 'STUDENT', studentInstitution: institution.trim(),
          sponsorName: sponsorName.trim(), sponsorRelationship, sponsorPhone: sponsorPhone.trim(),
          sponsorEmail: sponsorEmail.trim(), payer,
        });
      }
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      if (isStudent && studentIdFile) form.append('studentId', studentIdFile);
      const res = await api.bookShortLet(property.id, form);
      if (waOptIn) {
        api.captureWhatsAppConsent({ phone: guestPhone.trim(), brand: 'ESTATECOPILOT', source: 'short_let_booking_form', optInText: WHATSAPP_OPT_IN_TEXT, marketingOptIn: true }).catch(() => {});
      }
      if (res.paymentLink) {
        window.location.href = res.paymentLink;
      } else {
        setRequested({ manageUrl: res.manageUrl });
        setBooking(false);
      }
    } catch (err) {
      setBookError(err instanceof Error ? err.message : 'Booking failed — please try again');
      setBooking(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="font-semibold text-gray-900">{onlyStudents ? 'Request a student room' : 'Book your stay'}</h3>
            <p className="text-sm text-gray-500">{property.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {property.propertyType === 'SHORT_LET' && (
          <div className="flex gap-1 border-b border-gray-200 mb-4 mt-3 text-sm">
            {([['book', 'Book'], ['about', `Safety, rules & reviews${property.reviewCount ? ` (${property.reviewCount})` : ''}`]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 -mb-px border-b-2 ${tab === k ? 'border-emerald-600 text-emerald-800 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{label}</button>
            ))}
          </div>
        )}

        {tab === 'about' ? (
          <AboutPanel property={property} reviews={reviews} safety={safety} />
        ) : requested ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">Request sent — your dates are held</p>
              <p className="mt-1">
                The host is checking your student ID. Once they approve, {payer === 'SPONSOR' ? `${sponsorName || 'your sponsor'} gets` : 'you get'} a payment link by email.
                We've also emailed you a private link to your booking page — use it to follow your request, add move-in photos and reach your host.
              </p>
            </div>
            <a href={requested.manageUrl} className="block text-center w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">Open my booking page</a>
            <button onClick={onClose} className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Done</button>
          </div>
        ) : (
          <>
            {blockedRanges.length > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                Currently unavailable: {blockedRanges.map((r) => `${formatDateRange(r.checkIn)}–${formatDateRange(r.checkOut)}`).join(', ')}
              </p>
            )}
            {property.sessionRate ? (
              <p className="text-xs text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-4">
                Staying the whole session? Pick dates of 150+ nights for the session price of <strong>{naira.format(property.sessionRate)}</strong>.
              </p>
            ) : null}

            <form onSubmit={handleCheckAvailability} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-500">
                  {onlyStudents ? 'Move in' : 'Check in'}
                  <input value={checkIn} onChange={(e) => { setCheckIn(e.target.value); setQuote(null); }} type="date" required min={todayIso} className={`mt-1 ${inputCls}`} />
                </label>
                <label className="text-xs text-gray-500">
                  {onlyStudents ? 'Move out' : 'Check out'}
                  <input value={checkOut} onChange={(e) => { setCheckOut(e.target.value); setQuote(null); }} type="date" required min={checkIn || todayIso} className={`mt-1 ${inputCls}`} />
                </label>
              </div>
              {quoteError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{quoteError}</p>}
              {!quote && (
                <button type="submit" disabled={quoting || !checkIn || !checkOut} className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                  {quoting ? 'Checking…' : 'Check availability & price'}
                </button>
              )}
            </form>

            {quote && (
              <>
                <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-900">
                  <p className="font-semibold">
                    {quote.nights} night{quote.nights === 1 ? '' : 's'} available — {naira.format(quote.totalAmount)}
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">{RATE_LABEL[quote.rateType] ?? ''}</p>
                  {deposit > 0 && (
                    <p className="text-xs text-emerald-800 mt-2 border-t border-emerald-200 pt-2">
                      + {naira.format(deposit)} caution fee — <strong>held by EstateCopilot, not the landlord</strong>, and returned after you move out.
                      Total today: <strong>{naira.format(quote.totalAmount + deposit)}</strong>
                    </p>
                  )}
                </div>

                <form onSubmit={handleBook} className="space-y-3 mt-4">
                  <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your full name (as on your ID)" required className={inputCls} />
                  <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="Phone (WhatsApp)" required className={inputCls} />
                  <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} type="email" placeholder="Email" required className={inputCls} />

                  <fieldset className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <legend className="text-xs font-semibold text-gray-700 px-1">Verify your identity</legend>
                    <p className="text-xs text-gray-500">Every guest on EstateCopilot gives their BVN or NIN for an identity check against their name. We never store the number or show it to the host.</p>
                    <div className="flex gap-2">
                      <select value={idType} onChange={(e) => setIdType(e.target.value as 'BVN' | 'NIN')} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
                        <option value="NIN">NIN</option>
                        <option value="BVN">BVN</option>
                      </select>
                      <input value={idNumber} onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" placeholder={`11-digit ${idType}`} required className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm tracking-wider" />
                    </div>
                  </fieldset>

                  {property.studentFriendly && (
                    <fieldset className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 space-y-3">
                      {onlyStudents ? (
                        <p className="text-sm font-medium text-indigo-900">🎓 Students only — tell us about your studies</p>
                      ) : (
                        <label className="flex items-center gap-2 text-sm font-medium text-indigo-900">
                          <input type="checkbox" checked={isStudent} onChange={(e) => setIsStudent(e.target.checked)} />
                          I'm a student
                        </label>
                      )}
                      {isStudent && (
                        <>
                          <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="School (e.g. UNILAG, YABATECH)" className={`${inputCls} bg-white`} />
                          <label className="block text-xs text-gray-600">
                            Photo of your student ID card (or admission letter)
                            <input type="file" accept="image/*,application/pdf" onChange={(e) => setStudentIdFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
                          </label>

                          <div className="border-t border-indigo-100 pt-3 space-y-2">
                            <p className="text-xs font-semibold text-indigo-900">Parent, guardian or sponsor</p>
                            <p className="text-[11px] text-indigo-800">Your emergency contact. They get updates when your booking is approved and confirmed.</p>
                            <div className="grid grid-cols-2 gap-2">
                              <input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} placeholder="Full name" className={`${inputCls} bg-white`} />
                              <select value={sponsorRelationship} onChange={(e) => setSponsorRelationship(e.target.value)} className={`${inputCls} bg-white`}>
                                <option value="">Relationship</option>
                                {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
                              </select>
                              <input value={sponsorPhone} onChange={(e) => setSponsorPhone(e.target.value)} placeholder="Phone" className={`${inputCls} bg-white`} />
                              <input value={sponsorEmail} onChange={(e) => setSponsorEmail(e.target.value)} type="email" placeholder={payer === 'SPONSOR' ? 'Email (required)' : 'Email (optional)'} className={`${inputCls} bg-white`} />
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm text-gray-800 pt-1">
                              <span className="text-xs text-gray-500 w-full">Who is paying?</span>
                              <label className="flex items-center gap-1.5"><input type="radio" checked={payer === 'SPONSOR'} onChange={() => setPayer('SPONSOR')} /> My parent / sponsor</label>
                              <label className="flex items-center gap-1.5"><input type="radio" checked={payer === 'GUEST'} onChange={() => setPayer('GUEST')} /> Me</label>
                            </div>
                          </div>
                          <p className="text-[11px] text-indigo-800">Student stays are request-to-book: the host checks your student ID first. Only the host sees the card.</p>
                        </>
                      )}
                    </fieldset>
                  )}

                  <label className="flex items-start gap-2 text-xs text-gray-700 border border-gray-200 rounded-lg p-3">
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
                    <span>
                      I agree to the house rules{property.houseRules ? ' (see “Safety, rules & reviews”)' : ''} and the EstateCopilot stay agreement: I'll take care of the place, report damage honestly, and leave on my move-out date.
                      {deposit > 0 && ' My caution fee is held by EstateCopilot and returned after move-out, less only deductions backed by photo evidence — which I can dispute.'}
                    </span>
                  </label>

                  <WhatsAppOptIn checked={waOptIn} onChange={setWaOptIn} />
                  {bookError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{bookError}</p>}
                  <div className="flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
                    <button type="submit" disabled={booking} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                      {booking ? (isStudent ? 'Sending…' : 'Verifying…') : isStudent ? 'Request to book' : `Verify & pay ${naira.format(quote.totalAmount)}`}
                    </button>
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const AboutPanel: React.FC<{ property: StayListing; reviews: Review[] | null; safety: SafetyItem[] }> = ({ property, reviews, safety }) => {
  const have = new Set(property.safetyFeatures ?? []);
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h4 className="font-semibold text-gray-900 mb-1">Safety</h4>
        {property.safetyInspectedAt ? (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">
            ✓ Inspected by an EstateCopilot Student Ambassador on {new Date(property.safetyInspectedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        ) : (
          <p className="text-xs text-gray-500 mb-2">Declared by the host — not yet inspected by a Student Ambassador.</p>
        )}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {safety.map((f) => (
            <li key={f.key} className={`flex items-start gap-1.5 text-xs ${have.has(f.key) ? 'text-gray-800' : 'text-gray-400'}`}>
              <span>{have.has(f.key) ? '✓' : '–'}</span>
              <span>{f.label}{f.essential ? ' *' : ''}</span>
            </li>
          ))}
        </ul>
        {safety.length > 0 && <p className="text-[11px] text-gray-400 mt-1">* essential standard for student housing</p>}
      </section>

      {property.houseRules && (
        <section>
          <h4 className="font-semibold text-gray-900 mb-1">House rules</h4>
          <p className="text-xs text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg p-3">{property.houseRules}</p>
        </section>
      )}

      <section>
        <h4 className="font-semibold text-gray-900 mb-1">
          Verified reviews {property.ratingAvg ? <span className="text-amber-500 font-normal">{stars(property.ratingAvg)} {property.ratingAvg}</span> : null}
        </h4>
        <p className="text-[11px] text-gray-500 mb-2">Only guests who actually stayed can review.</p>
        {reviews === null ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : reviews.length === 0 ? (
          <p className="text-xs text-gray-500">No reviews yet{property.completedStays ? '' : ' — be the first'}.</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r, i) => (
              <li key={i} className="border border-gray-100 rounded-lg p-3">
                <p className="text-xs text-gray-500">
                  <span className="text-amber-500">{stars(r.overall)}</span> · {r.guestFirstName}{r.isStudent ? ' (student)' : ''} · {new Date(r.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">Safety {r.safety}/5 · Host {r.host}/5 · Value {r.value}/5 · As described {r.accuracy}/5</p>
                {r.comment && <p className="text-sm text-gray-700 mt-1">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default StayBookingForm;
