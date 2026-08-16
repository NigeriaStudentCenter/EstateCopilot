import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Property } from '../types';

const LEGAL_CATEGORIES = [
  'Eviction & Notice to Quit',
  'Tenancy Agreement Drafting/Review',
  'Rent Recovery & Disputes',
  'Property Title & Compliance',
  'Other',
];

interface LegalRequest {
  id: string;
  propertyId: string;
  propertyTitle?: string;
  category: string;
  description: string;
  raisedBy?: string;
  status: 'OPEN' | 'ENGAGED' | 'RESOLVED';
  openToMarketplace: boolean;
  engagedLawyerName?: string;
  engagedLawyerPhone?: string;
  engagedLawFirm?: string;
  createdAt: string;
}

interface LegalQuote {
  id: string;
  lawyerName: string;
  lawyerPhone: string;
  lawFirm?: string;
  amount: number;
  message?: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'DECLINED';
}

const statusStyles: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-900',
  ENGAGED: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
};

const LegalPage: React.FC = () => {
  const [requests, setRequests] = useState<LegalRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [propertyId, setPropertyId] = useState('');
  const [category, setCategory] = useState(LEGAL_CATEGORIES[0]);
  const [description, setDescription] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<LegalQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setError(null);
      const [requestList, propertyList] = await Promise.all([api.getLegalRequests(), api.getProperties()]);
      setRequests(requestList as LegalRequest[]);
      setProperties(propertyList as Property[]);
      if (!propertyId && propertyList[0]) setPropertyId((propertyList[0] as Property).id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach the backend');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !description.trim()) return;
    setSubmitting(true);
    try {
      await api.createLegalRequest({ propertyId, category, description: description.trim() });
      setDescription('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log the request');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleMarketplace(request: LegalRequest) {
    setBusyId(request.id);
    try {
      await api.setLegalMarketplaceListing(request.id, !request.openToMarketplace);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update marketplace listing');
    } finally {
      setBusyId(null);
    }
  }

  async function handleExpandQuotes(requestId: string) {
    if (expandedId === requestId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(requestId);
    setQuotesLoading(true);
    try {
      const data = await api.getLegalQuotes(requestId);
      setQuotes(data as LegalQuote[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proposals');
    } finally {
      setQuotesLoading(false);
    }
  }

  async function handleAcceptQuote(quoteId: string, requestId: string) {
    setBusyId(quoteId);
    try {
      await api.acceptLegalQuote(quoteId);
      const data = await api.getLegalQuotes(requestId);
      setQuotes(data as LegalQuote[]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept proposal');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Legal</h2>
        <p className="text-sm text-gray-600 mt-1">
          Notice to quit, tenancy agreement review, rent recovery, disputes — log what you need, then open it to
          verified Nigerian lawyers on the marketplace and pick the proposal you want. No retainer required.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">Log a legal request</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Property</label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">What do you need?</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {LEGAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Tenant is 3 months behind on rent and I need to start the notice-to-quit process"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Logging…' : 'Log request'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Your legal requests</h3>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-sm text-gray-500">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">No legal requests yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {requests.map((r) => (
              <li key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[r.status]}`}>
                        {r.status}
                      </span>
                      {r.openToMarketplace && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-800 border border-purple-200">
                          On marketplace
                        </span>
                      )}
                      <span className="text-sm font-semibold text-gray-900">{r.propertyTitle}</span>
                    </div>
                    <p className="text-xs text-gray-500">{r.category}</p>
                    <p className="text-sm text-gray-700">{r.description}</p>
                    {r.engagedLawyerName && (
                      <p className="text-xs text-emerald-700 mt-1">
                        ✓ Engaged: {r.engagedLawyerName}{r.engagedLawFirm ? ` (${r.engagedLawFirm})` : ''} · {r.engagedLawyerPhone}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {r.status === 'OPEN' && (
                      <button
                        onClick={() => handleToggleMarketplace(r)}
                        disabled={busyId === r.id}
                        className="text-xs font-medium border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        {r.openToMarketplace ? 'Remove from marketplace' : 'List on marketplace'}
                      </button>
                    )}
                    {r.openToMarketplace && (
                      <button onClick={() => handleExpandQuotes(r.id)} className="text-xs text-emerald-700 hover:underline">
                        {expandedId === r.id ? 'Hide proposals' : 'View proposals'}
                      </button>
                    )}
                  </div>
                </div>

                {expandedId === r.id && (
                  <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-4">
                    {quotesLoading ? (
                      <p className="text-xs text-gray-500">Loading proposals…</p>
                    ) : quotes.length === 0 ? (
                      <p className="text-xs text-gray-500">No proposals yet — this request is visible on the public legal marketplace.</p>
                    ) : (
                      <ul className="space-y-2">
                        {quotes.map((q) => (
                          <li key={q.id} className="flex items-center justify-between text-sm bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <div>
                              <span className="font-medium text-gray-900">{q.lawyerName}</span>
                              {q.lawFirm && <span className="text-gray-500"> ({q.lawFirm})</span>}
                              <span className="text-gray-500"> · {q.lawyerPhone} · ₦{q.amount.toLocaleString()}</span>
                              {q.message && <p className="text-xs text-gray-400 italic">"{q.message}"</p>}
                            </div>
                            {q.status === 'ACCEPTED' ? (
                              <span className="text-xs font-medium text-emerald-700">✓ Accepted</span>
                            ) : (
                              <button
                                onClick={() => handleAcceptQuote(q.id, r.id)}
                                disabled={busyId === q.id}
                                className="text-xs font-medium bg-emerald-600 text-white px-3 py-1 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Accept
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LegalPage;
