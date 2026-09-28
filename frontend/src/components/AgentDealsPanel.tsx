import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AgentDeal } from '../types';

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

const STATUS: Record<AgentDeal['status'], string> = {
  PENDING_LANDLORD: 'Needs your confirmation',
  AWAITING_PAYMENT: 'Confirmed — tenant paying agent fee',
  PAID: 'Agent fee paid',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled by agent',
};

// Deals registered agents have recorded on this landlord's properties. The
// landlord confirms (the tenant then gets a Paystack link for the agent fee)
// or disputes. Hidden entirely until there's at least one deal.
const AgentDealsPanel: React.FC = () => {
  const [deals, setDeals] = useState<AgentDeal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.getAgentDeals().then((d) => setDeals(d as AgentDeal[])).catch(() => {});
  useEffect(() => {
    void load();
  }, []);

  if (deals.length === 0) return null;

  async function act(id: string, kind: 'confirm' | 'dispute') {
    let reason = '';
    if (kind === 'dispute') {
      reason = window.prompt("What's wrong with this deal? (e.g. I don't know this tenant)")?.trim() ?? '';
      if (reason.length < 3) return;
    }
    setBusy(id);
    setError(null);
    try {
      if (kind === 'confirm') await api.confirmAgentDeal(id);
      else await api.disputeAgentDeal(id, reason);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the deal');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h3 className="font-semibold text-gray-900">Agent deals</h3>
      <p className="text-sm text-gray-500 mb-3">
        Tenants found by registered EstateCopilot agents. Confirming costs you nothing — the tenant pays the agent fee.
      </p>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
      <ul className="space-y-2">
        {deals.map((d) => (
          <li key={d.id} className="border border-gray-100 rounded-lg px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-gray-900">{d.property.title}</p>
              <p className="text-gray-500">
                Tenant {d.tenantName} ({d.tenantPhone}) · Rent {naira(d.annualRent)} · via {d.agent.name}
                {d.agent.agencyName ? ` (${d.agent.agencyName})` : ''}
              </p>
            </div>
            {d.status === 'PENDING_LANDLORD' ? (
              <div className="flex gap-2">
                <button disabled={busy === d.id} onClick={() => act(d.id, 'dispute')} className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 disabled:opacity-50">
                  Dispute
                </button>
                <button disabled={busy === d.id} onClick={() => act(d.id, 'confirm')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  Confirm
                </button>
              </div>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">{STATUS[d.status]}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AgentDealsPanel;
