import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { agentApi, agentSession, naira, ApiError, type Agent, type Alert, type Deal, type Lead, type Listing } from '../lib/agent';

type Tab = 'alerts' | 'listings' | 'leads' | 'deals' | 'payouts';

const DEAL_STATUS: Record<Deal['status'], { label: string; cls: string }> = {
  PENDING_LANDLORD: { label: 'Waiting for landlord', cls: 'bg-amber-100 text-amber-900' },
  AWAITING_PAYMENT: { label: 'Waiting for tenant payment', cls: 'bg-sky-100 text-sky-900' },
  PAID: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800' },
  DISPUTED: { label: 'Disputed', cls: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
};

const LEAD_STATUS: Record<Lead['status'], string> = {
  REQUESTED: 'New',
  CONFIRMED: 'Viewing arranged',
  COMPLETED: 'Done',
  CANCELLED: 'Not proceeding',
};

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const waDigits = (phone: string) => phone.replace(/[^0-9]/g, '').replace(/^0/, '234');

const AgentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'alerts');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealFor, setDealFor] = useState<{ listing?: Listing; lead?: Lead } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, a, l, ld, d] = await Promise.all([agentApi.me(), agentApi.alerts(), agentApi.listings(), agentApi.leads(), agentApi.deals()]);
      setAgent(me);
      setAlerts(a);
      setListings(l);
      setLeads(ld);
      setDeals(d);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate('/agents/login', { replace: true });
      else setError(err instanceof Error ? err.message : 'Could not load your dashboard');
    }
  }, [navigate]);

  useEffect(() => {
    if (!agentSession.get()) {
      navigate('/agents/login', { replace: true });
      return;
    }
    void load();
  }, [load, navigate]);

  function go(t: Tab) {
    setTab(t);
    params.set('tab', t);
    params.delete('welcome');
    setParams(params, { replace: true });
    if (t === 'alerts' && agent?.stats?.unreadAlerts) {
      agentApi.readAllAlerts().then(load).catch(() => {});
    }
  }

  if (!agent) {
    return <div className="max-w-6xl mx-auto px-4 py-16 text-sm text-gray-500">{error ?? 'Loading your dashboard…'}</div>;
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'alerts', label: 'Alerts', badge: agent.stats?.unreadAlerts },
    { id: 'listings', label: 'Listings', badge: listings.length },
    { id: 'leads', label: 'Leads', badge: agent.stats?.openLeads },
    { id: 'deals', label: 'Deals', badge: agent.stats?.openDeals },
    { id: 'payouts', label: 'Payouts & profile' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Agent dashboard</p>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-gray-900">Hello, {agent.name.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {agent.agencyName ? `${agent.agencyName} · ` : ''}Covering {agent.states.join(', ')} · Your code <span className="font-mono font-semibold text-gray-700">{agent.code}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <Stat label="Earned" value={naira(agent.stats?.earned ?? 0)} />
          <Stat label="Open leads" value={String(agent.stats?.openLeads ?? 0)} />
          <Stat label="Open deals" value={String(agent.stats?.openDeals ?? 0)} />
        </div>
      </div>

      {!agent.payoutsConnected && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 mb-6 text-sm flex flex-wrap items-center justify-between gap-3">
          <span>
            <strong>{params.get('welcome') ? 'Welcome! ' : ''}One more step:</strong> add your bank account so your share of each agent fee is paid to you automatically.
          </span>
          <button onClick={() => go('payouts')} className="bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium">Add bank account</button>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => go(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {t.label}
            {!!t.badge && <span className="ml-1.5 bg-emerald-100 text-emerald-800 text-xs rounded-full px-1.5 py-0.5">{t.badge}</span>}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {tab === 'alerts' && (
        <div className="space-y-2">
          {alerts.length === 0 && <Empty>No alerts yet. You'll be notified here (and by email) when a property is listed in your states.</Empty>}
          {alerts.map((a) => (
            <div key={a.id} className={`bg-white border rounded-xl px-4 py-3 ${a.readAt ? 'border-gray-100' : 'border-emerald-200 bg-emerald-50/40'}`}>
              <div className="flex justify-between gap-3">
                <p className="font-medium text-gray-900 text-sm">
                  {a.kind === 'NEW_LISTING' ? '🏠 ' : a.kind === 'NEW_LEAD' ? '📞 ' : '🤝 '}
                  {a.title}
                </p>
                <span className="text-xs text-gray-400 whitespace-nowrap">{when(a.createdAt)}</span>
              </div>
              <p className="text-sm text-gray-600 mt-0.5 break-words">{a.body}</p>
              {a.kind === 'NEW_LISTING' && <button onClick={() => go('listings')} className="text-xs text-emerald-700 font-medium mt-1">Get my share link →</button>}
              {a.kind === 'NEW_LEAD' && <button onClick={() => go('leads')} className="text-xs text-emerald-700 font-medium mt-1">View lead →</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'listings' && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {listings.length === 0 && <Empty>No live listings in {agent.states.join(', ')} right now. New ones will appear here and in your alerts.</Empty>}
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} onDeal={() => setDealFor({ listing: l })} />
          ))}
        </div>
      )}

      {tab === 'leads' && (
        <div className="space-y-3">
          {leads.length === 0 && <Empty>No leads yet. Share your listing links — when a client requests a viewing through one, they appear here with their contact details.</Empty>}
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} onChange={load} onDeal={() => setDealFor({ lead: l })} />
          ))}
        </div>
      )}

      {tab === 'deals' && (
        <div className="space-y-3">
          {deals.length === 0 && <Empty>No deals yet. When a client agrees to rent, record the deal from the lead (or the listing) — the landlord confirms it and the tenant pays the fee.</Empty>}
          {deals.map((d) => (
            <DealRow key={d.id} deal={d} onChange={load} />
          ))}
        </div>
      )}

      {tab === 'payouts' && <Payouts agent={agent} onSaved={load} />}

      {dealFor && (
        <DealModal
          listing={dealFor.listing}
          lead={dealFor.lead}
          listings={listings}
          onClose={() => setDealFor(null)}
          onNeedsBank={() => {
            setDealFor(null);
            go('payouts');
          }}
          onDone={() => {
            setDealFor(null);
            void load();
            go('deals');
          }}
        />
      )}

      <div className="mt-10 text-right">
        <button
          onClick={() => {
            agentSession.clear();
            navigate('/agents');
          }}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};

export default AgentDashboard;

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white border border-gray-100 rounded-xl px-4 py-2 shadow-sm text-right">
    <p className="text-xs text-gray-500">{label}</p>
    <p className="font-semibold text-gray-900">{value}</p>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border border-dashed border-gray-300 rounded-xl p-10 text-center text-sm text-gray-500 md:col-span-2 lg:col-span-3">{children}</div>
);

const ListingCard: React.FC<{ listing: Listing; onDeal: () => void }> = ({ listing: l, onDeal }) => {
  const [copied, setCopied] = useState(false);
  const price = l.propertyType === 'SHORT_LET' && l.nightlyRate ? `${naira(l.nightlyRate)}/night` : `${naira(l.rentAmount)}/yr`;
  const shareText = `${l.title} — ${l.lga}, ${l.state}. ${price}. View photos and book a viewing: ${l.shareUrl}`;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {l.imageUrls?.[0] ? (
        <img src={l.imageUrls[0]} alt={l.title} className="h-40 w-full object-cover" />
      ) : (
        <div className="h-40 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">No photo yet</div>
      )}
      <div className="p-4 flex-1 flex flex-col">
        <p className="font-semibold text-gray-900">{l.title}</p>
        <p className="text-sm text-gray-500">{l.lga}, {l.state} · {price}</p>
        {l.agentFee !== null && (
          <p className="text-sm text-emerald-800 mt-1">Agent fee {l.agentFeePercent}% · <strong>{naira(l.agentFee)}</strong></p>
        )}
        {l.myLeads > 0 && <p className="text-xs text-gray-500 mt-1">{l.myLeads} lead{l.myLeads === 1 ? '' : 's'} from your link</p>}
        <div className="mt-3 flex gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center bg-emerald-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-emerald-700"
          >
            Share on WhatsApp
          </a>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(l.shareUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>
        {l.propertyType === 'LONG_TERM' && (
          <button onClick={onDeal} className="mt-2 text-sm text-emerald-700 font-medium hover:underline text-left">
            Closed a deal on this? Record it →
          </button>
        )}
      </div>
    </div>
  );
};

const LeadRow: React.FC<{ lead: Lead; onChange: () => void; onDeal: () => void }> = ({ lead: l, onChange, onDeal }) => {
  const [saving, setSaving] = useState(false);
  const setStatus = async (status: Lead['status']) => {
    setSaving(true);
    try {
      await agentApi.updateLead(l.id, { status });
      onChange();
    } finally {
      setSaving(false);
    }
  };
  const wa = `https://wa.me/${waDigits(l.requesterPhone)}?text=${encodeURIComponent(`Hello ${l.requesterName.split(' ')[0]}, this is about your viewing request for ${l.property.title} on EstateCopilot.`)}`;
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{l.requesterName}</p>
          <p className="text-sm text-gray-500">{l.property.title} · wants to view {when(l.scheduledFor)}</p>
        </div>
        <span className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 h-fit">{l.dealStatus ? `Deal: ${DEAL_STATUS[l.dealStatus as Deal['status']]?.label ?? l.dealStatus}` : LEAD_STATUS[l.status]}</span>
      </div>
      {l.notes && <p className="text-sm text-gray-600 mt-2">“{l.notes}”</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href={`tel:${l.requesterPhone}`} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">📞 {l.requesterPhone}</a>
        <a href={wa} target="_blank" rel="noreferrer" className="text-sm border border-emerald-300 text-emerald-800 rounded-lg px-3 py-1.5 hover:bg-emerald-50">WhatsApp</a>
        {l.requesterEmail && <a href={`mailto:${l.requesterEmail}`} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">✉️ Email</a>}
        {!l.dealStatus && l.status !== 'CANCELLED' && (
          <>
            {l.status === 'REQUESTED' && (
              <button disabled={saving} onClick={() => setStatus('CONFIRMED')} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">Mark viewing arranged</button>
            )}
            {l.property.propertyType === 'LONG_TERM' && (
              <button onClick={onDeal} className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700">Record deal</button>
            )}
            <button disabled={saving} onClick={() => setStatus('CANCELLED')} className="text-sm text-gray-500 px-2 py-1.5 hover:text-gray-800">Not proceeding</button>
          </>
        )}
      </div>
    </div>
  );
};

const DealRow: React.FC<{ deal: Deal; onChange: () => void }> = ({ deal: d, onChange }) => {
  const s = DEAL_STATUS[d.status];
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{d.property?.title}</p>
          <p className="text-sm text-gray-500">Tenant: {d.tenantName} · Rent {naira(d.annualRent)}/yr</p>
        </div>
        <span className={`text-xs rounded-full px-2.5 py-1 h-fit ${s.cls}`}>{s.label}</span>
      </div>
      <div className="text-sm text-gray-700 mt-2 flex flex-wrap gap-x-5 gap-y-1">
        <span>Fee {naira(d.agentFee)}</span>
        <span>EstateCopilot {d.platformPercent}%: {naira(d.platformAmount)}</span>
        <span className="font-semibold text-emerald-800">You get {naira(d.agentAmount)}</span>
      </div>
      {d.status === 'AWAITING_PAYMENT' && d.paymentLink && (
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/${waDigits(d.tenantPhone)}?text=${encodeURIComponent(`Hello ${d.tenantName.split(' ')[0]}, the landlord has confirmed. Here's the secure link to pay the agent fee of ${naira(d.agentFee)}: ${d.paymentLink}`)}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"
          >
            Send payment link on WhatsApp
          </a>
          <button onClick={() => navigator.clipboard?.writeText(d.paymentLink!)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">Copy payment link</button>
        </div>
      )}
      {d.status === 'PENDING_LANDLORD' && <p className="text-xs text-gray-500 mt-2">We've emailed the landlord a one-click link to confirm. The tenant gets the payment link as soon as they do.</p>}
      {d.status === 'DISPUTED' && d.disputeReason && <p className="text-sm text-red-700 mt-2">Landlord: “{d.disputeReason}”. Our team will be in touch.</p>}
      {d.status === 'PAID' && d.paidAt && <p className="text-xs text-emerald-700 mt-2">Paid {when(d.paidAt)} — your share is settled to your bank.</p>}
      {(d.status === 'PENDING_LANDLORD' || d.status === 'AWAITING_PAYMENT') && (
        <button
          onClick={async () => {
            if (window.confirm('Cancel this deal?')) {
              await agentApi.cancelDeal(d.id);
              onChange();
            }
          }}
          className="text-xs text-gray-400 hover:text-gray-700 mt-2"
        >
          Cancel deal
        </button>
      )}
    </div>
  );
};

const DealModal: React.FC<{
  listing?: Listing;
  lead?: Lead;
  listings: Listing[];
  onClose: () => void;
  onDone: () => void;
  onNeedsBank: () => void;
}> = ({ listing, lead, listings, onClose, onDone, onNeedsBank }) => {
  const propertyId = listing?.id ?? lead?.property.id ?? '';
  const baseRent = listing?.rentAmount ?? lead?.property.rentAmount ?? 0;
  const pct = listing?.agentFeePercent ?? lead?.property.agentFeePercent ?? 10;
  const [form, setForm] = useState({
    tenantName: lead?.requesterName ?? '',
    tenantEmail: lead?.requesterEmail ?? '',
    tenantPhone: lead?.requesterPhone ?? '',
    annualRent: String(baseRent || ''),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rent = Number(form.annualRent.replace(/[^0-9]/g, '')) || 0;
  const fee = Math.round((rent * pct) / 100);
  const title = listing?.title ?? lead?.property.title ?? listings.find((l) => l.id === propertyId)?.title;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await agentApi.recordDeal({
        propertyId,
        bookingId: lead?.id,
        tenantName: form.tenantName.trim(),
        tenantEmail: form.tenantEmail.trim(),
        tenantPhone: form.tenantPhone.trim(),
        annualRent: rent,
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.body?.needsBank) onNeedsBank();
      else setError(err instanceof Error ? err.message : 'Could not record the deal');
    } finally {
      setSubmitting(false);
    }
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-3">
        <h3 className="font-semibold text-gray-900">Record a closed deal</h3>
        <p className="text-sm text-gray-500 -mt-2">{title}</p>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <input value={form.tenantName} onChange={set('tenantName')} required minLength={2} placeholder="Tenant's full name" className={input} />
        <input value={form.tenantEmail} onChange={set('tenantEmail')} required type="email" placeholder="Tenant's email (payment link goes here)" className={input} />
        <input value={form.tenantPhone} onChange={set('tenantPhone')} required minLength={10} placeholder="Tenant's phone" className={input} />
        <label className="block text-xs text-gray-500">
          Agreed annual rent (₦)
          <input value={form.annualRent} onChange={set('annualRent')} required inputMode="numeric" className={`${input} mt-1`} />
        </label>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-sm text-emerald-900">
          Agent fee ({pct}% of rent): <strong>{naira(fee)}</strong>, paid by the tenant through EstateCopilot.
        </div>
        <p className="text-xs text-gray-500">The landlord gets a one-click link to confirm. Once they do, the tenant is sent a secure Paystack link to pay the fee, and your share goes to your bank automatically.</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
          <button type="submit" disabled={submitting || !rent} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {submitting ? 'Sending…' : 'Send to landlord'}
          </button>
        </div>
      </form>
    </div>
  );
};

const Payouts: React.FC<{ agent: Agent; onSaved: () => void }> = ({ agent, onSaved }) => {
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [states, setStates] = useState<string[]>(agent.states);
  const [allStates, setAllStates] = useState<{ name: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    agentApi.banks().then(setBanks).catch(() => {});
    import('../lib/api').then(({ api }) => api.getStates().then(setAllStates).catch(() => {}));
  }, []);

  async function saveBank(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const a = await agentApi.saveBank(bankCode, accountNumber.trim());
      setMsg({ ok: true, text: `Payouts connected to ${a.bankAccountName} (••••${a.bankAccountLast4}).` });
      setAccountNumber('');
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  }

  async function saveStates() {
    if (!states.length) return;
    await agentApi.updateMe({ states });
    onSaved();
    setMsg({ ok: true, text: 'Your states are updated.' });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={saveBank} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
        <h3 className="font-semibold text-gray-900">Payout bank account</h3>
        {agent.payoutsConnected ? (
          <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">✓ Paid to {agent.bankAccountName} (••••{agent.bankAccountLast4})</p>
        ) : (
          <p className="text-sm text-gray-600">Your share of each agent fee is paid straight into this account by Paystack.</p>
        )}
        <select aria-label="Bank" value={bankCode} onChange={(e) => setBankCode(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="" disabled>Choose your bank</option>
          {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
        <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} required inputMode="numeric" aria-label="Account number" placeholder="10-digit account number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button disabled={saving || accountNumber.length !== 10 || !bankCode} className="w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
          {saving ? 'Verifying…' : agent.payoutsConnected ? 'Change bank account' : 'Verify and save'}
        </button>
        <p className="text-xs text-gray-400">We check the account name with your bank before saving. EstateCopilot keeps {agent.commissionPercent}% of each agent fee.</p>
      </form>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
        <h3 className="font-semibold text-gray-900">States you cover</h3>
        <div className="border border-gray-200 rounded-lg p-3 max-h-56 overflow-y-auto grid grid-cols-2 gap-1.5">
          {allStates.map((s) => (
            <label key={s.name} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" aria-label={s.name} checked={states.includes(s.name)} onChange={(e) => setStates(e.target.checked ? [...states, s.name] : states.filter((x) => x !== s.name))} />
              {s.name}
            </label>
          ))}
        </div>
        <button onClick={saveStates} disabled={!states.length} className="w-full border border-gray-300 text-gray-800 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Save states</button>
        <p className="text-xs text-gray-500">{agent.email} · {agent.phone}</p>
      </div>
      {msg && <p className={`md:col-span-2 text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <p className="md:col-span-2 text-xs text-gray-400">
        Need help? Email <a href="mailto:john@bsoedu.org" className="underline">john@bsoedu.org</a>. <Link to="/agents" className="underline">How it works</Link>
      </p>
    </div>
  );
};
