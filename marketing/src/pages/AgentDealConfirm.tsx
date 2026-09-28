import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { agentApi, naira, type LandlordDealView } from '../lib/agent';

// Opened from the landlord's email — the token in the link is the credential,
// so a landlord can confirm or dispute an agent's deal without signing in.
const AgentDealConfirm: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [deal, setDeal] = useState<LandlordDealView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    agentApi.landlordDeal(token).then(setDeal).catch((e) => setError(e instanceof Error ? e.message : 'This link is invalid'));
  }, [token]);

  async function act(kind: 'confirm' | 'dispute') {
    setBusy(true);
    setError(null);
    try {
      setDeal(kind === 'confirm' ? await agentApi.landlordConfirm(token) : await agentApi.landlordDispute(token, reason.trim()));
      setDisputing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[70vh] bg-gray-50 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-xl shadow-sm p-6 sm:p-8">
        <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-1">Agent deal</p>
        {!deal ? (
          <p className="text-sm text-gray-600">{error ?? 'Loading…'}</p>
        ) : (
          <>
            <h1 className="font-serif text-2xl font-bold text-gray-900 mb-1">{deal.property.title}</h1>
            <p className="text-sm text-gray-500 mb-5">{deal.property.address}, {deal.property.lga}, {deal.property.state}</p>

            <dl className="text-sm divide-y divide-gray-100 border border-gray-100 rounded-lg mb-5">
              <Row k="Agent" v={`${deal.agent.name}${deal.agent.agencyName ? ` (${deal.agent.agencyName})` : ''} · ${deal.agent.phone}`} />
              <Row k="New tenant" v={`${deal.tenantName} · ${deal.tenantPhone}`} />
              <Row k="Annual rent" v={naira(deal.annualRent)} />
              <Row k="Agent fee (paid by tenant)" v={naira(deal.agentFee)} />
            </dl>

            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}

            {deal.status === 'PENDING_LANDLORD' && !disputing && (
              <>
                <p className="text-sm text-gray-600 mb-4">Is this right? Confirming costs you nothing — the tenant is then sent a secure link to pay the agent fee.</p>
                <div className="flex gap-3">
                  <button disabled={busy} onClick={() => setDisputing(true)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">
                    Something's wrong
                  </button>
                  <button disabled={busy} onClick={() => act('confirm')} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                    {busy ? 'Confirming…' : 'Yes, confirm'}
                  </button>
                </div>
              </>
            )}
            {deal.status === 'PENDING_LANDLORD' && disputing && (
              <div className="space-y-3">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="What's wrong? e.g. I don't know this tenant, the rent is different…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <div className="flex gap-3">
                  <button onClick={() => setDisputing(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Back</button>
                  <button disabled={busy || reason.trim().length < 3} onClick={() => act('dispute')} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                    Send to EstateCopilot
                  </button>
                </div>
              </div>
            )}
            {deal.status === 'AWAITING_PAYMENT' && <Done tone="ok" text="Confirmed. The tenant has been sent a link to pay the agent fee. Thank you!" />}
            {deal.status === 'PAID' && <Done tone="ok" text="Confirmed, and the agent fee has been paid." />}
            {deal.status === 'DISPUTED' && <Done tone="warn" text="Thanks — our team will look into it and contact you and the agent." />}
            {deal.status === 'CANCELLED' && <Done tone="warn" text="The agent cancelled this deal. Nothing else to do." />}
          </>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex justify-between gap-4 px-4 py-2.5">
    <dt className="text-gray-500">{k}</dt>
    <dd className="text-gray-900 text-right font-medium">{v}</dd>
  </div>
);

const Done: React.FC<{ tone: 'ok' | 'warn'; text: string }> = ({ tone, text }) => (
  <p className={`text-sm rounded-lg px-4 py-3 ${tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{text}</p>
);

export default AgentDealConfirm;
