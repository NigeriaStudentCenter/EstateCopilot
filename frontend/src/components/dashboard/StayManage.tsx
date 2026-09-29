import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

// Host's view of one stay: guest + sponsor, condition reports (file one,
// confirm the guest's), problems the guest reported, the caution fee, and the
// guest's review. Opened from the Stays page.

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const AREAS = ['Room door & lock', 'Walls & ceiling', 'Floor', 'Bed & mattress', 'Wardrobe / storage', 'Windows & burglary proof', 'Fan / AC', 'Sockets & lighting', 'Bathroom / toilet', 'Kitchen area'];
const DEPOSIT_LABEL: Record<string, string> = {
  HELD: 'Held by EstateCopilot',
  PROPOSED: 'Your proposal is with the guest',
  DISPUTED: 'Disputed — EstateCopilot is reviewing',
  AGREED: 'Agreed — being paid out',
  RETURNED: 'Settled',
};
const btn = 'px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50';
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const StayManage: React.FC<{ bookingId: string; onClose: () => void; onChanged: () => void }> = ({ bookingId, onClose, onChanged }) => {
  const [b, setB] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getStay(bookingId).then(setB).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load this stay'));
  }, [bookingId]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setMsg(null);
    setErr(null);
    try {
      await fn();
      setMsg(done);
      load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{b ? b.guestName : 'Stay'}</h3>
            {b && <p className="text-sm text-gray-500">{b.propertyTitle} · {fmt(b.checkIn)} → {fmt(b.checkOut)} · {b.nights} nights · {naira.format(b.totalAmount)}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        {msg && <p className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-3 py-2">{msg}</p>}
        {err && <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">{err}</p>}
        {!b ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <section className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase mb-1">Guest</p>
                <p>{b.guestPhone} · {b.guestEmail}</p>
                <p className="text-xs mt-1">{b.idCheck === 'VERIFIED' ? `✓ ${b.idType} verified — ${b.idVerifiedName}` : b.idType ? `${b.idType} ••••${b.idLast4} · not checked yet` : 'No ID on file'}</p>
                {b.purpose === 'STUDENT' && <p className="text-xs mt-1">🎓 {b.studentInstitution}</p>}
              </div>
              {b.sponsorName && (
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase mb-1">Parent / sponsor · emergency contact</p>
                  <p>{b.sponsorName} ({b.sponsorRelationship})</p>
                  <p className="text-xs">{b.sponsorPhone}{b.sponsorEmail ? ` · ${b.sponsorEmail}` : ''}</p>
                  <p className="text-xs text-gray-500 mt-1">{b.payer === 'SPONSOR' ? 'Sponsor pays' : 'Student pays'}</p>
                </div>
              )}
            </section>

            <Reports b={b} act={act} />
            <Issues b={b} act={act} />
            {b.depositAmount > 0 && <Deposit b={b} act={act} />}

            {b.review && (
              <section>
                <h4 className="font-semibold text-gray-900 mb-1">Guest review</h4>
                <p className="text-amber-500">{'★'.repeat(b.review.overall)}{'☆'.repeat(5 - b.review.overall)}</p>
                <p className="text-xs text-gray-500">Safety {b.review.safety}/5 · Host {b.review.host}/5 · Value {b.review.value}/5 · As described {b.review.accuracy}/5</p>
                {b.review.comment && <p className="text-sm text-gray-700 mt-1">{b.review.comment}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

type Act = (fn: () => Promise<unknown>, done: string) => Promise<void>;

const Reports: React.FC<{ b: any; act: Act }> = ({ b, act }) => {
  const confirmed = b.status === 'CONFIRMED' || b.status === 'COMPLETED';
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'CHECK_IN' | 'CHECK_OUT'>(new Date(b.checkOut) <= new Date() ? 'CHECK_OUT' : 'CHECK_IN');
  const [items, setItems] = useState<Record<string, { condition: string; note: string }>>({});
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState<Record<string, string>>({});

  function submit() {
    const list = Object.entries(items).filter(([, v]) => v.condition).map(([area, v]) => ({ area, condition: v.condition, note: v.note || undefined }));
    const form = new FormData();
    form.append('kind', kind);
    form.append('items', JSON.stringify(list));
    if (notes) form.append('notes', notes);
    files.forEach((f) => form.append('photos', f));
    return act(async () => {
      if (!list.length) throw new Error('Rate at least one area.');
      await api.fileStayReport(b.id, form);
      setOpen(false);
      setItems({});
      setFiles([]);
    }, 'Report filed — the guest has been asked to confirm it.');
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-gray-900">Condition reports</h4>
        {confirmed && !open && <button onClick={() => setOpen(true)} className={`${btn} bg-gray-900 text-white`}>File a report</button>}
      </div>
      {!confirmed && <p className="text-xs text-gray-500">Reports open once the stay is paid.</p>}
      {open && (
        <div className="border border-gray-200 rounded-lg p-3 mb-3 space-y-2">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'CHECK_IN'} onChange={() => setKind('CHECK_IN')} /> Check-in</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'CHECK_OUT'} onChange={() => setKind('CHECK_OUT')} /> Check-out</label>
          </div>
          {AREAS.map((area) => (
            <div key={area} className="grid grid-cols-[170px_110px_1fr] gap-2 items-center">
              <span className="text-xs text-gray-700">{area}</span>
              <select value={items[area]?.condition ?? ''} onChange={(e) => setItems((m) => ({ ...m, [area]: { condition: e.target.value, note: m[area]?.note ?? '' } }))} className="border border-gray-300 rounded px-2 py-1 text-xs">
                <option value="">—</option>
                <option value="GOOD">Good</option>
                <option value="FAIR">Fair / worn</option>
                <option value="DAMAGED">Damaged</option>
              </select>
              <input value={items[area]?.note ?? ''} onChange={(e) => setItems((m) => ({ ...m, [area]: { condition: m[area]?.condition ?? '', note: e.target.value } }))} placeholder="Note" className="border border-gray-200 rounded px-2 py-1 text-xs" />
            </div>
          ))}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Other notes (meter reading, keys handed over…)" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 12))} className="text-xs" />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className={`${btn} border border-gray-300`}>Cancel</button>
            <button onClick={submit} className={`${btn} bg-emerald-600 text-white`}>Save report</button>
          </div>
        </div>
      )}
      <ul className="space-y-3">
        {b.reports.map((r: any) => (
          <li key={r.id} className="border border-gray-100 rounded-lg p-3">
            <p className="text-sm font-medium">{r.kind === 'CHECK_IN' ? 'Check-in' : 'Check-out'} · by {r.author === 'HOST' ? 'you' : 'guest'} · <span className="font-normal text-gray-500">{fmt(r.createdAt)}</span></p>
            <p className="text-xs">{r.confirmedAt ? <span className="text-emerald-700">✓ Confirmed</span> : r.responseComment ? <span className="text-amber-700">Disputed: {r.responseComment}</span> : <span className="text-gray-400">Awaiting confirmation</span>}</p>
            <ul className="mt-1 grid grid-cols-2 gap-x-3">
              {(r.items as any[]).map((it, i) => <li key={i} className="text-xs text-gray-700">{it.area}: <strong className={it.condition === 'DAMAGED' ? 'text-red-700' : ''}>{it.condition.toLowerCase()}</strong>{it.note ? ` — ${it.note}` : ''}</li>)}
            </ul>
            {r.notes && <p className="text-xs text-gray-600 mt-1">{r.notes}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              {r.photoUrls.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-16 h-16 rounded object-cover border" /></a>)}
            </div>
            {r.author === 'GUEST' && !r.confirmedAt && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => act(() => api.respondStayReport(b.id, r.id, true), 'Report confirmed.')} className={`${btn} bg-emerald-600 text-white`}>Accurate</button>
                <input value={comment[r.id] ?? ''} onChange={(e) => setComment((c) => ({ ...c, [r.id]: e.target.value }))} placeholder="What's wrong?" className="flex-1 border border-gray-300 rounded-lg px-2 text-sm" />
                <button onClick={() => act(() => api.respondStayReport(b.id, r.id, false, comment[r.id]), 'Your disagreement is recorded.')} className={`${btn} border border-amber-300 text-amber-800`}>Disagree</button>
              </div>
            )}
          </li>
        ))}
        {b.reports.length === 0 && confirmed && <li className="text-xs text-gray-400">No reports yet. File a check-in report with photos on day one — it's your evidence for any deduction later.</li>}
      </ul>
    </section>
  );
};

const Issues: React.FC<{ b: any; act: Act }> = ({ b, act }) => {
  const [reply, setReply] = useState<Record<string, string>>({});
  if (!b.issues.length) return null;
  return (
    <section>
      <h4 className="font-semibold text-gray-900 mb-2">Problems reported</h4>
      <ul className="space-y-2">
        {b.issues.map((i: any) => (
          <li key={i.id} className="border border-gray-100 rounded-lg p-3 text-sm">
            <p><span className={i.status === 'RESOLVED' ? 'text-emerald-700' : 'text-amber-700'}>{i.status === 'RESOLVED' ? '✓ Fixed' : '● Open'}</span> · {i.description}</p>
            <p className="text-xs text-gray-400">{fmt(i.createdAt)}{i.hostReply ? ` · Your reply: ${i.hostReply}` : ''}</p>
            {i.status === 'OPEN' && (
              <div className="flex gap-2 mt-2">
                <input value={reply[i.id] ?? ''} onChange={(e) => setReply((r) => ({ ...r, [i.id]: e.target.value }))} placeholder="What did you do? (optional)" className="flex-1 border border-gray-300 rounded-lg px-2 text-sm" />
                <button onClick={() => act(() => api.updateStayIssue(b.id, i.id, 'RESOLVED', reply[i.id] || undefined), 'Marked fixed — the guest has been told.')} className={`${btn} bg-emerald-600 text-white`}>Mark fixed</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

const Deposit: React.FC<{ b: any; act: Act }> = ({ b, act }) => {
  const [deduction, setDeduction] = useState('0');
  const [reason, setReason] = useState('');
  const d = b.deposit;
  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-gray-900">🔒 Caution fee — {naira.format(b.depositAmount)}</h4>
      <p className="text-sm text-gray-600">{DEPOSIT_LABEL[b.depositStatus] ?? b.depositStatus}</p>
      {['PROPOSED', 'DISPUTED', 'AGREED', 'RETURNED'].includes(b.depositStatus) && (
        <p className="text-sm mt-1">To guest: <strong>{naira.format(d.toGuest)}</strong> · To you: <strong>{naira.format(d.toHost)}</strong>{b.depositDeductionReason ? ` — ${b.depositDeductionReason}` : ''}</p>
      )}
      {b.depositDisputeNote && <p className="text-xs text-amber-800 mt-1">Guest's dispute: {b.depositDisputeNote}</p>}
      {d.canPropose && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">Propose how much goes back. Deductions are only for damage beyond fair wear and tear, need a reason, and need a check-out report with photos. The guest has 7 days to accept or dispute.</p>
          <div className="flex gap-2 items-center">
            <label className="text-sm">Deduct ₦</label>
            <input type="number" min={0} max={b.depositAmount} value={deduction} onChange={(e) => setDeduction(e.target.value)} className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
            <span className="text-xs text-gray-500">→ guest gets {naira.format(Math.max(0, b.depositAmount - (Number(deduction) || 0)))}</span>
          </div>
          {Number(deduction) > 0 && <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="What was damaged and what does it cost to fix?" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />}
          <button onClick={() => act(() => api.proposeDepositReturn(b.id, Number(deduction) || 0, reason || undefined), 'Proposal sent to the guest.')} className={`${btn} bg-emerald-600 text-white`}>
            {Number(deduction) > 0 ? 'Propose deduction' : 'Return in full'}
          </button>
        </div>
      )}
    </section>
  );
};

export default StayManage;
