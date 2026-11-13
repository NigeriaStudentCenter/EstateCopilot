import React from 'react';
import { api, ApiError, type Diagnosis, type DiagnosisCard, type DiagnosisPart, type Me, type SupplyState } from '../lib/api';
import { compressImage } from '../lib/compressImage';
import { loadList, loadOne, saveList, saveOne } from '../lib/diagnoseCache';
import { Button, Card, Field, Screen, input } from '../lib/ui';

const MAX_PHOTOS = 3;
type Photo = { file: File; url: string };
type View = { kind: 'capture' } | { kind: 'result'; d: Diagnosis };

const when = (iso: string) => new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

function useOnline() {
  const [on, setOn] = React.useState(navigator.onLine);
  React.useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

// Voice-to-text for the note, where the phone's browser supports it. Silent no-op elsewhere.
function useDictation(onText: (t: string) => void) {
  const Rec = (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
  const ref = React.useRef<any>(null);
  const [listening, setListening] = React.useState(false);
  const toggle = () => {
    if (!Rec) return;
    if (listening && ref.current) { ref.current.stop(); return; }
    const r = new Rec();
    r.lang = 'en-NG';
    r.interimResults = false;
    r.onresult = (e: any) => onText(Array.from(e.results).map((x: any) => x[0].transcript).join(' '));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    ref.current = r;
    setListening(true);
    r.start();
  };
  return { supported: !!Rec, listening, toggle };
}

export default function Diagnose({ me, flash, initialId }: { me: Me; flash: (t: string) => void; initialId?: string | null }) {
  const online = useOnline();
  const [view, setView] = React.useState<View>({ kind: 'capture' });
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<DiagnosisCard[]>(() => loadList(me.id));
  const dictation = useDictation((t) => setNote((n) => (n ? n + ' ' : '') + t));

  const refreshHistory = React.useCallback(() => {
    api.diagnoses().then((l) => { setHistory(l); saveList(me.id, l); }).catch(() => { /* offline: keep the cached list */ });
  }, [me.id]);
  React.useEffect(refreshHistory, [refreshHistory]);
  // Coming back from Paystack: reopen the diagnosis whose order was just paid.
  React.useEffect(() => { if (initialId) void open(initialId); }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(list).slice(0, room);
    const prepared = await Promise.all(picked.map(async (f) => {
      const file = await compressImage(f);
      return { file, url: URL.createObjectURL(file) };
    }));
    setPhotos((p) => [...p, ...prepared]);
    setError(null);
  }
  function removePhoto(i: number) {
    setPhotos((p) => { URL.revokeObjectURL(p[i].url); return p.filter((_, j) => j !== i); });
  }

  async function run() {
    if (photos.length === 0) return setError('Add at least one photo of the fault.');
    if (!navigator.onLine) return setError('No network. Your photos are kept: try again when you have signal.');
    setBusy(true);
    setError(null);
    try {
      const d = await api.diagnose(photos.map((p) => p.file), note);
      saveOne(me.id, d);
      setView({ kind: 'result', d });
      refreshHistory();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not reach the server. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setNote('');
    setError(null);
    setView({ kind: 'capture' });
  }

  async function open(id: string) {
    const cached = loadOne(me.id, id);
    if (cached) return setView({ kind: 'result', d: cached });
    try {
      const d = await api.diagnosis(id);
      saveOne(me.id, d);
      setView({ kind: 'result', d });
    } catch {
      flash('Not available offline');
    }
  }

  if (view.kind === 'result') {
    return <Result d={view.d} me={me} flash={flash} onNew={reset} onRetry={() => { setPhotos([]); setView({ kind: 'capture' }); setNote(view.d.note ?? ''); }} onSent={refreshHistory} />;
  }

  return (
    <Screen title="Diagnose a fault">
      {!online && <div className="mb-3 rounded-xl border border-black/10 bg-black/5 p-3 text-sm text-[#42504a]">You are offline. You can still open your past diagnoses below.</div>}
      <p className="mb-3 text-sm text-[#42504a]">Take a clear photo of the faulty fixture or pipe. The app tells you the fault, the tools, the parts to buy and the fix. <b>Plumbing only for now.</b></p>

      <Card className="mb-3 p-3">
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square overflow-hidden rounded-xl bg-black/5">
              <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-xs text-white">✕</button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-ochre-500/40 bg-ochre-50 text-center text-xs font-semibold text-ochre-700">
              <span><span className="block text-2xl">📷</span>Take photo</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
        {photos.length < MAX_PHOTOS && (
          <label className="mt-2 block cursor-pointer text-center text-xs font-semibold text-ochre-600 underline">
            or choose from your gallery
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
          </label>
        )}
        <p className="mt-2 text-xs text-[#8a948d]">Up to {MAX_PHOTOS} photos. One close-up of the fault and one wider shot give the best result.</p>
      </Card>

      <Field label="What is wrong? (optional)" hint="Where is it and what do you see? E.g. “Water drips under the kitchen sink”.">
        <div className="flex gap-2">
          <textarea className={input + ' min-h-[84px]'} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          {dictation.supported && (
            <button type="button" onClick={dictation.toggle} aria-label="Speak your note" className={`h-12 w-12 shrink-0 rounded-xl border text-lg ${dictation.listening ? 'border-ochre-500 bg-ochre-50' : 'border-black/15'}`}>🎤</button>
          )}
        </div>
      </Field>

      {error && <div role="alert" className="mt-3 rounded-xl border border-ochre-100 bg-ochre-50 p-3 text-sm text-ochre-700">{error}</div>}
      <div className="mt-4">
        <Button onClick={run} disabled={busy || photos.length === 0}>{busy ? 'Looking at your photos… (about 20 seconds)' : 'Diagnose'}</Button>
      </div>
      <p className="mt-2 text-xs text-[#8a948d]">Your photos are kept privately so we can check and improve the diagnoses. Location data is removed from them.</p>

      {history.length > 0 && (
        <>
          <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Past diagnoses</h2>
          <Card className="mb-6 divide-y divide-black/5">
            {history.map((h) => (
              <button key={h.id} onClick={() => void open(h.id)} className="flex w-full items-start gap-3 p-3 text-left active:bg-black/5">
                <span className="mt-0.5 text-lg">{h.safetyLevel === 'STOP' ? '⛔' : h.outcome === 'DIAGNOSED' ? '🔧' : '📷'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{h.summary}</span>
                  <span className="block text-xs text-[#8a948d]">{when(h.createdAt)}{h.partsRequestedAt ? ' · parts requested' : ''}</span>
                </span>
              </button>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const c = { good: 'bg-moss-600/10 text-moss-700', warn: 'bg-ochre-100 text-ochre-700', bad: 'bg-red-100 text-red-800', neutral: 'bg-black/5 text-[#6d7a73]' }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

function Result({ d, me, flash, onNew, onRetry, onSent }: { d: Diagnosis; me: Me; flash: (t: string) => void; onNew: () => void; onRetry: () => void; onSent: () => void }) {
  void me;
  const [sel, setSel] = React.useState(() => d.parts.map((p) => ({ on: true, qty: p.qty })));
  const [pidgin, setPidgin] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [showQuotes, setShowQuotes] = React.useState(!!d.supplyRequestId);
  const stop = d.safety.level === 'STOP';

  const chosen = (): DiagnosisPart[] => d.parts.map((p, i) => ({ ...p, qty: sel[i].qty })).filter((_, i) => sel[i].on);

  // Ask nearby suppliers for prices. If the supplier network is unavailable, fall back to the trade desk on WhatsApp.
  async function sendParts(viaWhatsApp = false) {
    const parts = chosen();
    if (parts.length === 0) return flash('Select at least one part');
    setSending(true);
    try {
      const r = await api.partsRequest(d.id, parts);
      onSent();
      if (r.supply && !viaWhatsApp) { setShowQuotes(true); return; }
      window.location.assign(r.whatsappUrl);
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'Could not prepare the request. Check your signal.');
    } finally {
      setSending(false);
    }
  }
  async function copyParts() {
    const parts = chosen();
    const text = parts.map((p, i) => `${i + 1}. ${p.name}${p.spec ? ` (${p.spec})` : ''} x ${p.qty}${p.unit ? ` ${p.unit}` : ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); flash('Parts list copied'); } catch { flash('Could not copy'); }
  }

  return (
    <Screen title={d.outcome === 'DIAGNOSED' ? 'Diagnosis' : d.outcome === 'NEEDS_MORE_PHOTOS' ? 'Need a clearer look' : 'Not a plumbing fault'}>
      {d.safety.level !== 'NORMAL' && (
        <div role="alert" className={`mb-3 rounded-2xl border p-4 text-sm ${stop ? 'border-red-300 bg-red-50 text-red-900' : 'border-ochre-100 bg-ochre-50 text-ochre-700'}`}>
          <b className="block text-base">{stop ? '⛔ Stop. This needs a qualified person.' : '⚠️ Take care'}</b>
          {d.safety.warnings.map((w, i) => <p key={i} className="mt-1">{w}</p>)}
          {stop && <p className="mt-2 font-semibold">No repair steps are given for this job. Make the area safe and call a qualified, supervised professional.</p>}
        </div>
      )}

      {d.immediateAction && (
        <Card className="mb-3 border-ochre-500/40 bg-ochre-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ochre-700">Do this first</div>
          <p className="mt-1 text-sm font-semibold text-ochre-700">{d.immediateAction}</p>
        </Card>
      )}

      <Card className="mb-3 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Pill tone={d.confidence === 'HIGH' ? 'good' : d.confidence === 'MEDIUM' ? 'warn' : 'bad'}>{d.confidence === 'HIGH' ? 'High confidence' : d.confidence === 'MEDIUM' ? 'Medium confidence' : 'Low confidence'}</Pill>
          {d.urgency === 'URGENT' && <Pill tone="bad">Urgent</Pill>}
          {d.urgency === 'SOON' && <Pill tone="warn">Fix soon</Pill>}
          {d.estimatedMinutes && <Pill tone="neutral">~{d.estimatedMinutes} min</Pill>}
        </div>
        <p className="text-[15px] font-semibold">{d.summary}</p>
        {d.outcome === 'DIAGNOSED' && (
          <dl className="mt-2 space-y-1 text-sm text-[#42504a]">
            <div><dt className="inline font-semibold">What: </dt><dd className="inline">{d.fixture}{d.material ? ` (${d.material})` : ''}</dd></div>
            <div><dt className="inline font-semibold">Fault: </dt><dd className="inline">{d.defect}</dd></div>
          </dl>
        )}
        {d.confidence !== 'HIGH' && d.alternativeCauses.length > 0 && (
          <p className="mt-2 text-sm text-[#42504a]"><b>It could also be:</b> {d.alternativeCauses.join('; ')}. Check on site before you buy parts.</p>
        )}
        {d.summaryPidgin && (
          <button onClick={() => setPidgin((v) => !v)} className="mt-2 text-xs font-semibold text-ochre-600 underline">{pidgin ? 'Hide Pidgin' : 'Explain in Pidgin'}</button>
        )}
        {pidgin && d.summaryPidgin && <p className="mt-1 rounded-lg bg-black/5 p-2 text-sm">{d.summaryPidgin}</p>}
      </Card>

      {d.outcome === 'NEEDS_MORE_PHOTOS' && (
        <Card className="mb-3 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Please add</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{d.photoRequests.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <div className="mt-3"><Button onClick={onRetry}>Take the photos and try again</Button></div>
        </Card>
      )}

      {d.outcome === 'DIAGNOSED' && d.parts.length > 0 && (
        <>
          <h2 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Parts to buy</h2>
          <Card className="mb-3 divide-y divide-black/5">
            {d.parts.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <input type="checkbox" className="h-5 w-5 accent-[#b4530e]" checked={sel[i].on} onChange={(e) => setSel((s) => s.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label={`Include ${p.name}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-[#8a948d]">{[p.spec, p.unit, p.note].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="h-8 w-8 rounded-lg border border-black/15" aria-label="Fewer" onClick={() => setSel((s) => s.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</button>
                  <span className="w-6 text-center text-sm font-semibold">{sel[i].qty}</span>
                  <button className="h-8 w-8 rounded-lg border border-black/15" aria-label="More" onClick={() => setSel((s) => s.map((x, j) => (j === i ? { ...x, qty: Math.min(100, x.qty + 1) } : x)))}>+</button>
                </div>
              </div>
            ))}
          </Card>
          {!showQuotes && <Button onClick={() => void sendParts()} disabled={sending}>{sending ? 'Sending…' : 'Get prices from suppliers'}</Button>}
          {showQuotes && <Quotes diagnosisId={d.id} onTradeDesk={() => void sendParts(true)} flash={flash} />}
          <button onClick={() => void copyParts()} className="mt-3 w-full text-center text-xs font-semibold text-ochre-600 underline">Copy the list instead</button>
          {d.partsRequestedAt && <p className="mt-1 text-center text-xs text-[#8a948d]">Last sent {when(d.partsRequestedAt)}</p>}
        </>
      )}

      {d.tools.length > 0 && (
        <>
          <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Tools</h2>
          <Card className="mb-3 p-4"><ul className="list-disc space-y-1 pl-5 text-sm">{d.tools.map((t, i) => <li key={i}>{t}</li>)}</ul></Card>
        </>
      )}

      {d.steps.length > 0 && (
        <>
          <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Steps</h2>
          <Card className="mb-3 p-4"><ol className="list-decimal space-y-2 pl-5 text-sm">{d.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></Card>
        </>
      )}

      <p className="mt-4 text-xs text-[#8a948d]">This is AI guidance from a photo. It can be wrong. Check the fault on site, and you stay responsible for safe, correct work.</p>
      <div className="mb-6 mt-4"><Button variant="ghost" onClick={onNew}>New diagnosis</Button></div>
    </Screen>
  );
}

const naira = (k: number) => `₦${Math.round(k / 100).toLocaleString('en-NG')}`;
const eta = (m: number) => (m <= 30 ? 'within 30 min' : m <= 60 ? 'within 1 hour' : m <= 120 ? 'within 2 hours' : m <= 240 ? 'within 4 hours' : 'next day');

// Prices from the suppliers Kolo asked. Refreshes by itself while the request is open.
function Quotes({ diagnosisId, onTradeDesk, flash }: { diagnosisId: string; onTradeDesk: () => void; flash: (t: string) => void }) {
  const [state, setState] = React.useState<SupplyState | null | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    api.quotes(diagnosisId).then((r) => { setState(r.supply); setError(null); }).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load quotes'));
  }, [diagnosisId]);
  React.useEffect(() => {
    load();
    const t = setInterval(() => { if (navigator.onLine) load(); }, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function choose(quoteId: string) {
    setBusy(quoteId);
    try {
      const r = await api.acceptQuote(diagnosisId, quoteId);
      setState(r.supply);
      if (r.supply.order?.authorizationUrl) window.location.assign(r.supply.order.authorizationUrl); // pay now
    }
    catch (e) { flash(e instanceof ApiError ? e.message : 'Could not confirm your choice'); load(); }
    finally { setBusy(null); }
  }

  const trade = <button onClick={onTradeDesk} className="mt-2 w-full rounded-xl border border-black/15 py-2.5 text-sm font-semibold text-[#42504a]">Ask our trade desk on WhatsApp instead</button>;
  if (state === undefined) return <Card className="p-4 text-sm text-[#6d7a73]">{error ?? 'Asking suppliers…'}{error && trade}</Card>;
  if (state === null) return <Card className="p-4 text-sm">Supplier prices are not available right now.{trade}</Card>;

  const accepted = state.quotes.find((q) => q.id === state.acceptedQuoteId);
  const order = state.order ?? null;
  const rate = accepted ? <RateSupplier diagnosisId={diagnosisId} state={state} supplierName={accepted.supplier.name} flash={flash} onDone={setState} /> : null;
  if (accepted && order && order.status !== 'EXPIRED') return <div className="space-y-3"><OrderCard diagnosisId={diagnosisId} state={state} accepted={accepted} order={order} reload={load} flash={flash} />{rate}</div>;
  if (accepted) {
    const p = accepted.supplier.contactPhone ?? '';
    return (
      <div className="space-y-3">
      <Card className="border-moss-600/40 bg-moss-600/5 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-moss-700">Supplier chosen</div>
        <p className="mt-1 font-semibold">{accepted.supplier.name} · {naira(accepted.totalKobo)}</p>
        <p className="text-sm text-[#42504a]">{accepted.supplier.address ?? accepted.supplier.area}</p>
        {p && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={`tel:${p}`} className="rounded-xl border border-black/15 bg-white py-2.5 text-center text-sm font-semibold">Call</a>
            <a href={`https://wa.me/${p.replace(/^0/, '234')}`} className="rounded-xl bg-[#25D366] py-2.5 text-center text-sm font-semibold text-white">WhatsApp</a>
          </div>
        )}
        <p className="mt-3 text-xs text-[#6d7a73]">The supplier has your number and will contact you about delivery ({eta(accepted.etaMinutes)}). Agree payment with the supplier directly.</p>
      </Card>
      {rate}
      </div>
    );
  }

  const closed = state.status !== 'OPEN';
  const quotes = [...state.quotes].sort((a, b) => a.totalKobo - b.totalKobo);
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Prices from suppliers near you</div>
      {quotes.length === 0 && (
        <Card className="p-4 text-sm">
          {closed ? <p>This request has closed without a price.</p>
            : state.suppliersAlerted === 0 || state.escalated ? <p><b>No supplier has answered yet.</b> Our trade desk can find the parts for you.</p>
            : <p>Asking <b>{state.suppliersAlerted}</b> supplier{state.suppliersAlerted === 1 ? '' : 's'} near you. Prices usually arrive within a few minutes, and this page updates by itself.</p>}
          {(closed || state.suppliersAlerted === 0 || state.escalated) && trade}
        </Card>
      )}
      <div className="space-y-2">
        {quotes.map((q, i) => (
          <Card key={q.id} className={`p-3 ${i === 0 && quotes.length > 1 ? 'border-moss-600/40' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{q.supplier.name}</p>
                <p className="text-xs text-[#8a948d]">{q.supplier.area}{q.supplier.rating ? ` · ★ ${q.supplier.rating} (${q.supplier.ratingCount})` : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-extrabold">{naira(q.totalKobo)}</p>
                {i === 0 && quotes.length > 1 && <p className="text-[11px] font-semibold text-moss-700">Lowest total</p>}
              </div>
            </div>
            <p className="mt-1 text-xs text-[#42504a]">Delivery {eta(q.etaMinutes)}{q.deliveryFeeKobo ? ` · delivery fee ${naira(q.deliveryFeeKobo)}` : ' · free delivery'}{q.complete ? '' : ' · some items not in stock'}</p>
            {q.note && <p className="mt-1 text-xs italic text-[#6d7a73]">“{q.note}”</p>}
            <button onClick={() => setOpen(open === q.id ? null : q.id)} className="mt-1 text-xs font-semibold text-ochre-600 underline">{open === q.id ? 'Hide prices' : 'See item prices'}</button>
            {open === q.id && (
              <ul className="mt-1 space-y-0.5 text-xs text-[#42504a]">
                {q.lines.map((l) => { const it = state.items[l.index]; return <li key={l.index}>{it ? `${it.name}${it.spec ? ` (${it.spec})` : ''} x ${it.qty}` : `Item ${l.index + 1}`}: {l.available ? `${naira(l.unitPriceKobo ?? 0)} each` : 'not in stock'}</li>; })}
              </ul>
            )}
            <div className="mt-2"><Button onClick={() => void choose(q.id)} disabled={busy !== null}>{busy === q.id ? 'Confirming…' : 'Choose this supplier'}</Button></div>
          </Card>
        ))}
      </div>
      {quotes.length > 0 && !closed && <p className="mt-2 text-center text-xs text-[#8a948d]">More prices may still arrive. You can wait or choose now.</p>}
      {quotes.length > 0 && trade}
    </div>
  );
}

// After the parts arrive: one rating per request. Higher-rated shops are asked first next time, so this matters to them.
// With payments off there is no delivery signal, so the box starts closed behind "I received the parts".
function RateSupplier({ diagnosisId, state, supplierName, flash, onDone }: { diagnosisId: string; state: SupplyState; supplierName: string; flash: (t: string) => void; onDone: (s: SupplyState) => void }) {
  const [open, setOpen] = React.useState(!!state.paymentsEnabled);
  const [stars, setStars] = React.useState(0);
  const [onTime, setOnTime] = React.useState<boolean | undefined>();
  const [asDescribed, setAsDescribed] = React.useState<boolean | undefined>();
  const [comment, setComment] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  if (state.rating) return <Card className="p-3 text-center text-sm text-[#42504a]">You rated {supplierName}: <span className="text-ochre-600">{'★'.repeat(state.rating.stars)}</span>{'☆'.repeat(5 - state.rating.stars)}. Thank you.</Card>;
  if (!state.canRate) return null;
  if (!open) return <button onClick={() => setOpen(true)} className="w-full rounded-xl border border-black/15 bg-white py-2.5 text-sm font-semibold text-[#42504a]">I received the parts: rate {supplierName}</button>;

  async function submit() {
    setBusy(true);
    try {
      const r = await api.rateSupplier(diagnosisId, { stars, ...(onTime !== undefined ? { onTime } : {}), ...(asDescribed !== undefined ? { asDescribed } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) });
      onDone(r.supply); flash('Thanks for rating');
    } catch (e) { flash(e instanceof ApiError ? e.message : 'Could not save your rating'); } finally { setBusy(false); }
  }
  const yn = (label: string, v: boolean | undefined, set: (b: boolean) => void) => (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <span className="flex gap-1.5">
        {[true, false].map((b) => <button key={String(b)} type="button" onClick={() => set(b)} aria-pressed={v === b} className={`min-h-[36px] rounded-lg border px-3 text-xs font-semibold ${v === b ? 'border-moss-600 bg-moss-600 text-white' : 'border-black/15 bg-white'}`}>{b ? 'Yes' : 'No'}</button>)}
      </span>
    </div>
  );
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">How was {supplierName}?</p>
      <div className="mt-2 flex justify-center gap-1" role="radiogroup" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setStars(n)} className={`min-h-[44px] min-w-[44px] text-3xl ${n <= stars ? 'text-ochre-600' : 'text-black/20'}`}>★</button>)}
      </div>
      <div className="mt-2 space-y-2">
        {yn('Arrived on time?', onTime, setOnTime)}
        {yn('Right parts and sizes?', asDescribed, setAsDescribed)}
      </div>
      <textarea className={input + ' mt-3 min-h-[60px]'} maxLength={300} placeholder="Anything to add? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-3"><Button disabled={busy || stars === 0} onClick={() => void submit()}>{busy ? 'Saving…' : 'Send rating'}</Button></div>
    </Card>
  );
}

// A chosen quote with an order: pay, wait for delivery, confirm or report a problem. The money is held until you confirm.
function OrderCard({ diagnosisId, state, accepted, order, reload, flash }: { diagnosisId: string; state: SupplyState; accepted: SupplyState['quotes'][number]; order: NonNullable<SupplyState['order']>; reload: () => void; flash: (t: string) => void }) {
  void state;
  const [busy, setBusy] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const p = accepted.supplier.contactPhone ?? '';
  const paid = ['PAID', 'SHIPPED', 'DELIVERED', 'RELEASED', 'DISPUTED'].includes(order.status);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try { await fn(); flash(okMsg); reload(); } catch (e) { flash(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); } finally { setBusy(false); }
  }

  const title: Record<string, string> = {
    AWAITING_PAYMENT: 'Pay to confirm your order', PAID: 'Paid: the supplier will deliver', SHIPPED: 'On its way', DELIVERED: 'Delivered', RELEASED: 'Completed', DISPUTED: 'Problem reported', REFUNDED: 'Refunded',
  };
  return (
    <Card className="border-moss-600/40 bg-moss-600/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-moss-700">{title[order.status] ?? 'Order'}</div>
      <p className="mt-1 font-semibold">{accepted.supplier.name} · {naira(order.amountKobo)}</p>

      {order.status === 'AWAITING_PAYMENT' && (
        <>
          <p className="mt-2 text-sm text-[#42504a]">Your money is held safely and only goes to the supplier after you confirm you received the parts. This offer is kept for a short time.</p>
          {order.authorizationUrl && <div className="mt-3"><Button onClick={() => window.location.assign(order.authorizationUrl as string)}>Pay {naira(order.amountKobo)} securely</Button></div>}
          <button onClick={reload} className="mt-2 w-full text-center text-xs font-semibold text-ochre-600 underline">I have paid: check now</button>
        </>
      )}

      {paid && p && order.status !== 'DISPUTED' && (
        <>
          <p className="text-sm text-[#42504a]">{accepted.supplier.address ?? accepted.supplier.area}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={`tel:${p}`} className="rounded-xl border border-black/15 bg-white py-2.5 text-center text-sm font-semibold">Call</a>
            <a href={`https://wa.me/${p.replace(/^0/, '234')}`} className="rounded-xl bg-[#25D366] py-2.5 text-center text-sm font-semibold text-white">WhatsApp</a>
          </div>
        </>
      )}

      {(order.status === 'PAID' || order.status === 'SHIPPED') && (
        <>
          <p className="mt-3 text-xs text-[#6d7a73]">{order.status === 'PAID' ? 'Waiting for the supplier to dispatch.' : 'The supplier says it is on the way.'} Your money is held until you confirm. If you do nothing, it is released to the supplier {order.releaseAfter ? `after ${new Date(order.releaseAfter).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}` : '48 hours after dispatch'}.</p>
          {!reporting ? (
            <div className="mt-3 space-y-2">
              <Button disabled={busy} onClick={() => void act(() => api.confirmOrder(diagnosisId), 'Thank you. The supplier is being paid.')}>I received the parts</Button>
              <button onClick={() => setReporting(true)} className="w-full text-center text-xs font-semibold text-red-700 underline">Report a problem</button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <textarea className={input + ' min-h-[72px]'} maxLength={500} placeholder="What went wrong? E.g. wrong size, missing items, not delivered" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button disabled={busy || note.trim().length < 3} onClick={() => void act(() => api.disputeOrder(diagnosisId, note.trim()), 'We have your report and will look into it.')}>Send report</Button>
              <button onClick={() => setReporting(false)} className="w-full text-center text-xs font-semibold text-[#6d7a73] underline">Cancel</button>
            </div>
          )}
        </>
      )}
      {order.status === 'DELIVERED' && <p className="mt-3 text-xs text-[#6d7a73]">You confirmed receipt. The supplier is being paid.</p>}
      {order.status === 'RELEASED' && <p className="mt-3 text-xs text-[#6d7a73]">All done. The supplier has been paid. Thank you for using EstateCopilot.</p>}
      {order.status === 'DISPUTED' && <p className="mt-3 text-sm text-[#42504a]">We are looking into your report. Your money stays held and nobody is paid until we decide. {order.disputeNote ? `You said: “${order.disputeNote}”.` : ''}</p>}
      {order.status === 'REFUNDED' && <p className="mt-3 text-sm text-[#42504a]">Your payment was refunded.</p>}
    </Card>
  );
}
