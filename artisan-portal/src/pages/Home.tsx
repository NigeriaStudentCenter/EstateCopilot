import React from 'react';
import { api, ApiError, type Dashboard, type Me } from '../lib/api';
import { Badge, Card, Screen } from '../lib/ui';

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const STATUS: Record<Dashboard['status']['availability'], { label: string; hint: string; dot: string }> = {
  OPEN: { label: 'Open for work', hint: 'You are shown to people looking for your trade.', dot: 'bg-moss-600' },
  BUSY: { label: 'Busy', hint: 'You stay listed but people see you are busy.', dot: 'bg-ochre-500' },
  AWAY: { label: 'Away', hint: 'You are hidden from new requests until you come back.', dot: 'bg-black/30' },
};

function Tile({ label, value, sub, tone = '' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <Card className={`p-4 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6d7a73]">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-tight text-[#16241d]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[#6d7a73]">{sub}</p>}
    </Card>
  );
}

export default function Home({ me, flash, go, reload }: { me: Me; flash: (t: string) => void; go: (t: 'diagnose' | 'jobs' | 'profile') => void; reload: () => void }) {
  const [d, setD] = React.useState<Dashboard | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => { api.dashboard().then((x) => { setD(x); setError(null); }).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load your dashboard')); }, []);
  React.useEffect(() => {
    load();
    const t = setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function setAvail(v: Dashboard['status']['availability']) {
    if (!d || d.status.availability === v) return;
    setBusy(true);
    try { await api.updateMe({ availability: v }); setD({ ...d, status: { ...d.status, availability: v } }); reload(); flash(`Status: ${STATUS[v].label}`); }
    catch (e) { flash(e instanceof ApiError ? e.message : 'Could not change your status'); }
    finally { setBusy(false); }
  }

  if (error && !d) return <Screen title="Home"><Card className="p-4 text-sm text-ochre-700">{error}<button onClick={load} className="mt-2 block font-semibold underline">Try again</button></Card></Screen>;
  if (!d) return <Screen title="Home"><p className="text-sm text-[#8a948d]">Loading…</p></Screen>;

  const s = STATUS[d.status.availability];
  const first = d.name.trim().split(/\s+/)[0];
  const v = d.verification;
  return (
    <Screen title={`Hello, ${first}`}>
      {/* status */}
      <Card className="mb-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />{s.label}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.status.listed ? 'bg-moss-600/10 text-moss-700' : 'bg-black/5 text-[#6d7a73]'}`}>{d.status.listed ? 'Listed in directory' : 'Not listed yet'}</span>
        </div>
        <p className="mt-1 text-xs text-[#6d7a73]">{s.hint}{!d.status.listed && ' Verify your ID to be listed.'}</p>
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Your status">
          {(['OPEN', 'BUSY', 'AWAY'] as const).map((k) => (
            <button key={k} disabled={busy} aria-pressed={d.status.availability === k} onClick={() => void setAvail(k)}
              className={`min-h-[44px] rounded-xl border text-sm font-medium ${d.status.availability === k ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'}`}>
              {k === 'OPEN' ? 'Open' : k === 'BUSY' ? 'Busy' : 'Away'}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Jobs received" value={d.jobs.receivedThisMonth} sub={<>this month · {d.jobs.receivedTotal} in all</>} />
        <Tile label={`Earnings · ${d.earnings.monthLabel.split(' ')[0]}`} value={naira.format(d.earnings.thisMonth)}
          sub={d.earnings.pending > 0 ? <>{naira.format(d.earnings.pending)} waiting to be paid</> : d.earnings.paidJobsThisMonth ? <>{d.earnings.paidJobsThisMonth} paid job{d.earnings.paidJobsThisMonth === 1 ? '' : 's'}</> : 'No paid jobs yet this month'} />
        <Tile label="Rating" value={d.ratings.average ? <><span className="text-ochre-600">★</span> {d.ratings.average.toFixed(1)}</> : <span className="text-base font-semibold text-[#6d7a73]">No ratings yet</span>}
          sub={d.ratings.count ? `from ${d.ratings.count} rating${d.ratings.count === 1 ? '' : 's'}` : 'Ratings appear after completed jobs'} />
        <Tile label="Verified" value={<Badge tier={v.tier} />}
          sub={v.certified ? 'Course certificate linked' : v.idVerified ? 'Link a course certificate to get certified' : 'ID check not done yet'} />
      </div>

      {d.jobs.newRequests > 0 && (
        <button onClick={() => go('jobs')} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-ochre-300 bg-ochre-50/70 p-4 text-left">
          <span><b className="text-ochre-700">{d.jobs.newRequests} new request{d.jobs.newRequests === 1 ? '' : 's'}</b><span className="block text-xs text-[#6d7a73]">People asked for you directly. Reply while they are still looking.</span></span>
          <span className="text-lg" aria-hidden>›</span>
        </button>
      )}
      {!v.idVerified && (
        <button onClick={() => go('profile')} className="mt-3 w-full rounded-2xl border border-black/10 bg-white p-4 text-left text-sm"><b>Verify your NIN or BVN</b><span className="block text-xs text-[#6d7a73]">Verified artisans get listed and matched to jobs. It takes a minute.</span></button>
      )}

      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Quick actions</p>
      <div className="grid grid-cols-2 gap-3 pb-4">
        <button onClick={() => go('diagnose')} className="min-h-[64px] rounded-2xl bg-ochre-500 px-3 text-sm font-semibold text-white">📷 Diagnose a fault</button>
        <button onClick={() => go('jobs')} className="min-h-[64px] rounded-2xl border border-black/15 bg-white px-3 text-sm font-semibold">🧰 See jobs</button>
      </div>
      {me.certified && <p className="pb-4 text-center text-xs text-[#6d7a73]">Your course certificate is on your profile.</p>}
    </Screen>
  );
}
