import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/stays';

// The guest's private booking page — opened from the link in their booking
// email (no account needed). Everything a student (or their sponsor) needs
// for the whole stay: status, payment, host contact, house rules, move-in
// and move-out photos, reporting problems, the caution fee, and a review.

type Stay = any;

const STEPS = [
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'stay', label: 'Staying' },
  { key: 'out', label: 'Moved out' },
  { key: 'deposit', label: 'Caution fee back' },
];

function stepIndex(s: Stay): number {
  const now = new Date();
  if (s.status === 'CANCELLED') return -1;
  if (s.deposit.status === 'RETURNED') return 5;
  if (s.status === 'COMPLETED' || (s.status === 'CONFIRMED' && new Date(s.checkOut) <= now)) return 4;
  if (s.status === 'CONFIRMED' && new Date(s.checkIn) <= now) return 3;
  if (s.status === 'CONFIRMED') return 2;
  if (s.status === 'PENDING_PAYMENT') return 1;
  return 0;
}

const card = 'bg-white border border-gray-200 rounded-xl p-5';
const btn = 'px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50';

const StayBooking: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [stay, setStay] = useState<Stay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getStay(token).then(setStay).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your booking'));
  }, [token]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setFlash(null);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'status' in (r as any) && 'deposit' in (r as any)) setStay(r);
      else load();
      setFlash(done);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-700">{error}</p>
        <Link to="/stays?student=1" className="text-emerald-700 text-sm hover:underline mt-4 inline-block">Browse student stays</Link>
      </div>
    );
  }
  if (!stay) return <p className="max-w-xl mx-auto px-4 py-20 text-sm text-gray-500">Loading your booking…</p>;

  const step = stepIndex(stay);
  const student = stay.purpose === 'STUDENT';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-5">
      <div>
        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Your {student ? 'student ' : ''}stay</p>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-gray-900">{stay.property.title}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {shortDate(stay.checkIn)} → {shortDate(stay.checkOut)} · {stay.nights} nights · {naira.format(stay.totalAmount)}
          {stay.deposit.amount > 0 && ` + ${naira.format(stay.deposit.amount)} caution fee`}
        </p>
      </div>

      {flash && <div className="bg-sky-50 border border-sky-200 text-sky-900 text-sm rounded-lg px-4 py-2">{flash}</div>}

      {/* progress */}
      {stay.status === 'CANCELLED' ? (
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-4 text-sm text-gray-700">
          This booking was cancelled.{stay.hostNote ? ` Host's note: ${stay.hostNote}` : ''} No payment was taken.{' '}
          <Link to="/stays?student=1" className="text-emerald-700 hover:underline">Find another place</Link>
        </div>
      ) : (
        <ol className="grid grid-cols-6 gap-1">
          {STEPS.filter((_, i) => i !== 5 || stay.deposit.amount > 0).map((s, i) => (
            <li key={s.key} className="text-center">
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-emerald-600' : 'bg-gray-200'}`} />
              <p className={`text-[11px] mt-1 ${i <= step ? 'text-emerald-800 font-medium' : 'text-gray-400'}`}>{s.label}</p>
            </li>
          ))}
        </ol>
      )}

      {stay.status === 'AWAITING_APPROVAL' && (
        <div className={`${card} border-indigo-200 bg-indigo-50/50`}>
          <p className="font-semibold text-indigo-900">Waiting for the host to check your student ID</p>
          <p className="text-sm text-indigo-900/80 mt-1">Your dates are held. When they approve, {stay.payer === 'SPONSOR' ? `${stay.sponsor?.name ?? 'your sponsor'} gets` : 'you get'} a payment link by email — it also appears here.</p>
        </div>
      )}
      {stay.can.pay && (
        <div className={`${card} border-emerald-200 bg-emerald-50/60 flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <p className="font-semibold text-emerald-900">Approved — pay to confirm your place</p>
            <p className="text-sm text-emerald-900/80">{naira.format(stay.totalAmount + stay.deposit.amount)} total{stay.deposit.amount ? ` (includes the ${naira.format(stay.deposit.amount)} caution fee held by EstateCopilot)` : ''}.</p>
          </div>
          <a href={stay.paymentLink} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Pay now</a>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <div className={card}>
          <h2 className="font-semibold text-gray-900 mb-2">The place</h2>
          <p className="text-sm text-gray-700">{stay.property.address}</p>
          {stay.status !== 'CONFIRMED' && stay.status !== 'COMPLETED' && <p className="text-xs text-gray-400 mt-1">Exact address and host phone appear once payment is confirmed.</p>}
          <p className="text-sm text-gray-700 mt-3">Host: <strong>{stay.host.name}</strong>{stay.host.phone && <> · <a href={`tel:${stay.host.phone}`} className="text-emerald-700">{stay.host.phone}</a> · <a href={`https://wa.me/${String(stay.host.phone).replace(/\D/g, '')}`} className="text-emerald-700">WhatsApp</a></>}</p>
          {stay.idType && <p className="text-xs text-gray-500 mt-2">ID check: {stay.idCheck === 'VERIFIED' ? `✓ ${stay.idType} verified` : `${stay.idType} received — verification pending`}</p>}
          {stay.sponsor && <p className="text-xs text-gray-500 mt-1">Emergency contact: {stay.sponsor.name} ({stay.sponsor.relationship}) · {stay.sponsor.phone}</p>}
        </div>
        <div className={card}>
          <h2 className="font-semibold text-gray-900 mb-2">Safety {stay.property.safetyInspectedAt && <span className="ml-1 text-xs font-medium text-white bg-emerald-600 rounded-full px-2 py-0.5">✓ Inspected</span>}</h2>
          <p className="text-xs text-gray-500 mb-2">Safety score {stay.property.safetyScore}/100</p>
          <ul className="space-y-0.5">
            {stay.property.safetyFeatures.filter((f: any) => f.present).map((f: any) => <li key={f.key} className="text-xs text-gray-700">✓ {f.label}</li>)}
          </ul>
          {stay.property.safetyFeatures.some((f: any) => f.essential && !f.present) && (
            <p className="text-xs text-amber-800 mt-2">Not declared: {stay.property.safetyFeatures.filter((f: any) => f.essential && !f.present).map((f: any) => f.label).join(', ')}</p>
          )}
        </div>
      </div>

      {stay.property.houseRules && (
        <div className={card}>
          <h2 className="font-semibold text-gray-900 mb-2">House rules</h2>
          <p className="text-sm text-gray-700 whitespace-pre-line">{stay.property.houseRules}</p>
        </div>
      )}

      <Reports stay={stay} token={token} onDone={(m) => { load(); setFlash(m); }} act={act} />

      {(stay.can.reportIssue || stay.issues.length > 0) && <Issues stay={stay} token={token} act={act} />}

      {stay.deposit.amount > 0 && <Deposit stay={stay} token={token} act={act} />}

      {(stay.can.review || stay.review) && <ReviewBox stay={stay} token={token} act={act} />}

      <p className="text-xs text-gray-400 text-center pt-4">
        Keep this link private — anyone with it can manage this booking. Questions or safety concerns? Email <a href="mailto:john@bsoedu.org" className="underline">john@bsoedu.org</a>. <Link to="/students" className="underline">Student Housing Hub</Link>
      </p>
    </div>
  );
};

type ActFn = (fn: () => Promise<unknown>, done: string) => Promise<void>;

const Reports: React.FC<{ stay: Stay; token: string; onDone: (msg: string) => void; act: ActFn }> = ({ stay, token, onDone, act }) => {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'CHECK_IN' | 'CHECK_OUT'>(new Date(stay.checkOut) <= new Date() ? 'CHECK_OUT' : 'CHECK_IN');
  const [items, setItems] = useState<Record<string, { condition: string; note: string }>>({});
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = Object.entries(items).filter(([, v]) => v.condition).map(([area, v]) => ({ area, condition: v.condition, note: v.note || undefined }));
    if (!list.length) return setErr('Rate at least one area of the room.');
    if (!files.length) return setErr('Add at least one photo.');
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('items', JSON.stringify(list));
      if (notes) form.append('notes', notes);
      files.forEach((f) => form.append('photos', f));
      await api.stayReport(token, form);
      setOpen(false);
      setItems({});
      setFiles([]);
      onDone('Report saved — your host has been asked to confirm it.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-semibold text-gray-900">Move-in & move-out photos</h2>
        {stay.can.fileReport && !open && <button onClick={() => setOpen(true)} className={`${btn} bg-gray-900 text-white`}>Add a report</button>}
      </div>
      <p className="text-xs text-gray-500 mb-3">Photos of the room's condition when you move in and out are your protection if there's ever a question about your caution fee.</p>

      {open && (
        <form onSubmit={submit} className="border border-gray-200 rounded-lg p-3 mb-4 space-y-3">
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'CHECK_IN'} onChange={() => setKind('CHECK_IN')} /> Moving in</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'CHECK_OUT'} onChange={() => setKind('CHECK_OUT')} /> Moving out</label>
          </div>
          <div className="space-y-1.5">
            {stay.reportAreas.map((area: string) => (
              <div key={area} className="grid grid-cols-[1fr_auto] sm:grid-cols-[180px_auto_1fr] gap-2 items-center">
                <span className="text-xs text-gray-700">{area}</span>
                <select value={items[area]?.condition ?? ''} onChange={(e) => setItems((m) => ({ ...m, [area]: { condition: e.target.value, note: m[area]?.note ?? '' } }))} className="border border-gray-300 rounded px-2 py-1 text-xs">
                  <option value="">—</option>
                  <option value="GOOD">Good</option>
                  <option value="FAIR">Fair / worn</option>
                  <option value="DAMAGED">Damaged</option>
                </select>
                <input value={items[area]?.note ?? ''} onChange={(e) => setItems((m) => ({ ...m, [area]: { condition: m[area]?.condition ?? '', note: e.target.value } }))} placeholder="Note (optional)" className="border border-gray-200 rounded px-2 py-1 text-xs col-span-2 sm:col-span-1" />
              </div>
            ))}
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything else (e.g. meter reading, keys received)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 12))} className="block text-xs" />
          <p className="text-[11px] text-gray-400">Up to 12 photos: walls, floor, bed, doors, bathroom, any existing damage.</p>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className={`${btn} border border-gray-300`}>Cancel</button>
            <button disabled={busy} className={`${btn} bg-emerald-600 text-white`}>{busy ? 'Uploading…' : 'Save report'}</button>
          </div>
        </form>
      )}

      {stay.reports.length === 0 ? (
        <p className="text-sm text-gray-400">No reports yet.</p>
      ) : (
        <ul className="space-y-4">
          {stay.reports.map((r: any) => (
            <li key={r.id} className="border border-gray-100 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-900">
                {r.kind === 'CHECK_IN' ? 'Move-in' : 'Move-out'} report by {r.author === 'HOST' ? 'your host' : 'you'} · <span className="text-gray-500 font-normal">{shortDate(r.createdAt)}</span>
              </p>
              <p className="text-xs mt-0.5">{r.confirmedAt ? <span className="text-emerald-700">✓ Confirmed by {r.author === 'HOST' ? 'you' : 'host'}</span> : r.responseComment ? <span className="text-amber-700">Disputed: {r.responseComment}</span> : <span className="text-gray-400">Not confirmed yet</span>}</p>
              <ul className="mt-2 grid sm:grid-cols-2 gap-x-4">
                {(r.items as any[]).map((it, i) => (
                  <li key={i} className="text-xs text-gray-700">
                    <span className={it.condition === 'DAMAGED' ? 'text-red-700' : it.condition === 'FAIR' ? 'text-amber-700' : 'text-emerald-700'}>●</span> {it.area}: {it.condition.toLowerCase()}{it.note ? ` — ${it.note}` : ''}
                  </li>
                ))}
              </ul>
              {r.notes && <p className="text-xs text-gray-600 mt-1">{r.notes}</p>}
              {r.photoUrls.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {r.photoUrls.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-20 h-20 object-cover rounded border border-gray-200" /></a>)}
                </div>
              )}
              {r.author === 'HOST' && !r.confirmedAt && (
                <div className="flex flex-wrap gap-2 mt-3 items-center">
                  <button onClick={() => act(() => api.stayPost(token, `reports/${r.id}/respond`, { agree: true }), 'Thanks — report confirmed.')} className={`${btn} bg-emerald-600 text-white`}>It's accurate</button>
                  <input value={comment[r.id] ?? ''} onChange={(e) => setComment((c) => ({ ...c, [r.id]: e.target.value }))} placeholder="What's wrong with it?" className="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={() => act(() => api.stayPost(token, `reports/${r.id}/respond`, { agree: false, comment: comment[r.id] }), 'Your disagreement is recorded — the host has been told.')} className={`${btn} border border-amber-300 text-amber-800`}>Disagree</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Issues: React.FC<{ stay: Stay; token: string; act: ActFn }> = ({ stay, token, act }) => {
  const [text, setText] = useState('');
  return (
    <div className={card}>
      <h2 className="font-semibold text-gray-900 mb-1">Report a problem</h2>
      <p className="text-xs text-gray-500 mb-3">No water or power, a broken lock, a safety worry — your host is notified straight away. For emergencies call 112.</p>
      {stay.can.reportIssue && (
        <form onSubmit={(e) => { e.preventDefault(); act(() => api.stayPost(token, 'issues', { description: text }), 'Sent to your host.').then(() => setText('')); }} className="flex gap-2 mb-3">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What's wrong?" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button disabled={text.trim().length < 5} className={`${btn} bg-gray-900 text-white`}>Send</button>
        </form>
      )}
      <ul className="space-y-2">
        {stay.issues.map((i: any) => (
          <li key={i.id} className="text-sm border-l-2 pl-3 border-gray-200">
            <span className={i.status === 'RESOLVED' ? 'text-emerald-700' : 'text-amber-700'}>{i.status === 'RESOLVED' ? '✓ Fixed' : '● Open'}</span> · {i.description}
            {i.hostReply && <p className="text-xs text-gray-500">Host: {i.hostReply}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
};

const DEPOSIT_TEXT: Record<string, string> = {
  NONE: '',
  HELD: 'Held safely by EstateCopilot. After you move out, your host proposes the return — any deduction must be explained and backed by move-out photos.',
  PROPOSED: 'Your host has proposed the return below.',
  DISPUTED: 'You disputed the deduction. EstateCopilot is reviewing the photos and notes from both sides and will decide.',
  AGREED: 'Agreed — EstateCopilot is sending your refund.',
  RETURNED: 'Returned to you.',
};

const Deposit: React.FC<{ stay: Stay; token: string; act: ActFn }> = ({ stay, token, act }) => {
  const d = stay.deposit;
  const [note, setNote] = useState('');
  const [disputing, setDisputing] = useState(false);
  return (
    <div className={card}>
      <h2 className="font-semibold text-gray-900 mb-1">🔒 Caution fee — {naira.format(d.amount)}</h2>
      <p className="text-sm text-gray-600">{DEPOSIT_TEXT[d.status] ?? ''}</p>
      {['PROPOSED', 'DISPUTED', 'AGREED', 'RETURNED'].includes(d.status) && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="bg-emerald-50 rounded-lg p-3"><p className="text-xs text-emerald-700">Back to you</p><p className="font-semibold text-emerald-900">{naira.format(d.toGuest)}</p></div>
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">Deduction</p><p className="font-semibold text-gray-900">{naira.format(d.toHost)}</p></div>
          {d.reason && <p className="col-span-2 text-xs text-gray-600">Reason: {d.reason}</p>}
          {d.disputeNote && <p className="col-span-2 text-xs text-gray-600">Your dispute: {d.disputeNote}</p>}
        </div>
      )}
      {stay.can.respondDeposit && (
        <div className="mt-4 space-y-2">
          {d.responseDeadline && <p className="text-xs text-gray-500">Reply by {shortDate(d.responseDeadline)} — if you don't, the proposal is accepted automatically.</p>}
          {!disputing ? (
            <div className="flex gap-2">
              <button onClick={() => act(() => api.stayPost(token, 'deposit/accept', {}), 'Accepted — your refund is on its way.')} className={`${btn} bg-emerald-600 text-white`}>Accept</button>
              {d.toHost > 0 && <button onClick={() => setDisputing(true)} className={`${btn} border border-amber-300 text-amber-800`}>Dispute the deduction</button>}
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); act(() => api.stayPost(token, 'deposit/dispute', { note }), 'Dispute sent — EstateCopilot will review both sides.'); }} className="space-y-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Why is the deduction wrong? Refer to your move-in photos if you can." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setDisputing(false)} className={`${btn} border border-gray-300`}>Back</button>
                <button disabled={note.trim().length < 10} className={`${btn} bg-amber-600 text-white`}>Send dispute</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

const CATS = [['overall', 'Overall'], ['safety', 'Safety'], ['host', 'Host'], ['value', 'Value for money'], ['accuracy', 'As described']] as const;

const ReviewBox: React.FC<{ stay: Stay; token: string; act: ActFn }> = ({ stay, token, act }) => {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  if (stay.review) {
    return (
      <div className={card}>
        <h2 className="font-semibold text-gray-900 mb-1">Your review</h2>
        <p className="text-sm text-amber-500">{'★'.repeat(stay.review.overall)}{'☆'.repeat(5 - stay.review.overall)}</p>
        {stay.review.comment && <p className="text-sm text-gray-700 mt-1">{stay.review.comment}</p>}
        <p className="text-xs text-gray-400 mt-2">Thanks — reviews from real students keep others safe.</p>
      </div>
    );
  }
  const complete = CATS.every(([k]) => scores[k]);
  return (
    <div className={card}>
      <h2 className="font-semibold text-gray-900 mb-1">Review your stay</h2>
      <p className="text-xs text-gray-500 mb-3">Honest reviews help the next student choose safely. Only your first name is shown.</p>
      <div className="space-y-1.5">
        {CATS.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between max-w-sm">
            <span className="text-sm text-gray-700">{label}</span>
            <span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setScores((s) => ({ ...s, [k]: n }))} aria-label={`${label} ${n}`} className={`text-xl leading-none ${n <= (scores[k] ?? 0) ? 'text-amber-500' : 'text-gray-300'}`}>★</button>
              ))}
            </span>
          </div>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="What should other students know?" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-3" />
      <button disabled={!complete} onClick={() => act(() => api.stayPost(token, 'review', { ...scores, comment: comment.trim() || undefined }), 'Thanks for your review!')} className={`${btn} bg-emerald-600 text-white mt-2`}>Post review</button>
    </div>
  );
};

export default StayBooking;
