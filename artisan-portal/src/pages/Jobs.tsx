import React from 'react';
import { api, ApiError, type Job, type Lead, type LeadStatus, type Me } from '../lib/api';
import { Button, Card, Screen, input } from '../lib/ui';

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const shortDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export default function Jobs({ me, flash }: { me: Me; flash: (t: string) => void }) {
  const [jobs, setJobs] = React.useState<Job[] | null>(null);
  const [leads, setLeads] = React.useState<Lead[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  function load() {
    api.jobs().then(setJobs).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load jobs'));
    api.leads().then(setLeads).catch(() => setLeads([]));
  }
  React.useEffect(load, []);

  async function setLeadStatus(id: string, status: LeadStatus) {
    try {
      const updated = await api.updateLead(id, status);
      setLeads((prev) => (prev ? prev.map((l) => (l.id === id ? updated : l)) : prev));
      flash(status === 'CONTACTED' ? 'Marked as contacted' : status === 'CLOSED' ? 'Request closed' : 'Reopened');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update');
    }
  }

  const covered = Array.from(new Set([me.baseLga, ...me.coverageLgas])).join(', ');
  const openLeads = (leads ?? []).filter((l) => l.status !== 'CLOSED');

  return (
    <Screen title="Open jobs">
      {openLeads.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ochre-700">
            Direct requests · {openLeads.length}
          </p>
          <div className="space-y-3">
            {openLeads.map((l) => (
              <Card key={l.id} className={`p-4 ${l.status === 'NEW' ? 'border-ochre-300 bg-ochre-50/60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#16241d]">{l.requesterName}</p>
                    <p className="text-xs text-[#8a948d]">
                      {[l.requesterRole, l.tradeLabel, l.lga].filter(Boolean).join(' · ')} · {shortDate(l.createdAt)}
                    </p>
                  </div>
                  {l.status === 'NEW' && (
                    <span className="rounded-full bg-ochre-500 px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-[#3a463f]">{l.message}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    href={`tel:${l.requesterPhone}`}
                    className="flex min-h-[44px] items-center justify-center rounded-xl bg-moss-600 px-3 text-sm font-semibold text-white"
                  >
                    Call {l.requesterPhone}
                  </a>
                  {l.status === 'NEW' ? (
                    <Button variant="ghost" onClick={() => setLeadStatus(l.id, 'CONTACTED')}>Mark contacted</Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setLeadStatus(l.id, 'CLOSED')}>Close request</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <p className="mb-3 text-sm text-[#6d7a73]">
        Repair jobs on the marketplace in <b className="text-[#16241d]">{covered}</b>.
      </p>
      {error && <p className="rounded-xl border border-ochre-100 bg-ochre-50 px-3 py-2 text-sm text-ochre-700">{error}</p>}
      {jobs === null && <p className="text-sm text-[#8a948d]">Loading…</p>}
      {jobs?.length === 0 && (
        <Card className="p-5 text-sm text-[#6d7a73]">
          No open jobs in your area right now. Widen your coverage LGAs on your profile, or check back soon.
        </Card>
      )}
      <div className="space-y-3">
        {jobs?.map((j) => (
          <Card key={j.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8a948d]">
                  {j.categoryLabel ?? 'Repair'} · {j.lga}
                </p>
                <p className="mt-1 font-medium">{j.description}</p>
                <p className="mt-1 text-xs text-[#8a948d]">
                  {j.responsibility === 'LANDLORD' ? "Landlord's repair" : j.responsibility === 'TENANT' ? "Tenant's repair" : 'Responsibility TBC'} ·
                  {' '}
                  {new Date(j.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            </div>
            {j.alreadyQuoted ? (
              <p className="mt-3 rounded-lg bg-moss-600/10 px-3 py-2 text-xs font-medium text-moss-700">Quote sent</p>
            ) : openId === j.id ? (
              <QuoteForm
                jobId={j.id}
                onDone={() => { setOpenId(null); flash('Quote sent'); load(); }}
                onCancel={() => setOpenId(null)}
              />
            ) : (
              <div className="mt-3 grid grid-cols-1">
                <Button onClick={() => setOpenId(j.id)}>Send a quote</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </Screen>
  );
}

function QuoteForm({ jobId, onDone, onCancel }: { jobId: string; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const n = Number(amount);

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api.quote(jobId, n, message.trim() || undefined);
          onDone();
        } catch (e2) {
          setErr(e2 instanceof ApiError ? e2.message : 'Could not send');
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        className={input}
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
        placeholder="Your price in ₦"
        required
      />
      {n > 0 && <p className="text-xs text-[#8a948d]">{naira.format(n)}</p>}
      <textarea
        className={input}
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Optional note — what's included, when you can start…"
      />
      {err && <p className="text-xs text-ochre-700">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy || !(n > 0)}>{busy ? 'Sending…' : 'Send quote'}</Button>
      </div>
    </form>
  );
}
