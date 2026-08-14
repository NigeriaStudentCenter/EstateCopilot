import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { MaintenanceTicket, Property, RepairQuote, ResponsibilityChecklist } from '../types';

const statusStyles: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-900',
  DISPATCHED: 'bg-blue-100 text-blue-800',
  AWAITING_TENANT_SIGNOFF: 'bg-purple-100 text-purple-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
};

const responsibilityBadge: Record<string, { text: string; className: string }> = {
  LANDLORD: { text: 'Landlord responsibility', className: 'bg-blue-50 text-blue-800 border border-blue-200' },
  TENANT: { text: 'Tenant responsibility', className: 'bg-amber-50 text-amber-900 border border-amber-200' },
  UNCLEAR: { text: 'Unspecified', className: 'bg-gray-50 text-gray-600 border border-gray-200' },
};

const MaintenancePage: React.FC = () => {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [checklist, setChecklist] = useState<ResponsibilityChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [propertyId, setPropertyId] = useState('');
  const [raisedBy, setRaisedBy] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<RepairQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setError(null);
      const [ticketList, propertyList, checklistData] = await Promise.all([
        api.getMaintenanceTickets(),
        api.getProperties(),
        api.getChecklist(),
      ]);
      setTickets(ticketList as MaintenanceTicket[]);
      setProperties(propertyList as Property[]);
      setChecklist(checklistData as ResponsibilityChecklist[]);
      if (!propertyId && propertyList[0]) setPropertyId(propertyList[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach the backend. Is it running on :4000?');
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
      const property = properties.find((p) => p.id === propertyId);
      await api.createMaintenanceTicket({
        propertyId,
        propertyTitle: property?.title,
        raisedBy: raisedBy.trim() || undefined,
        description: description.trim(),
        categoryId: categoryId || undefined,
      });
      setDescription('');
      setRaisedBy('');
      setCategoryId('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log the complaint');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOff(ticketId: string) {
    try {
      await api.signOffTicket(ticketId, true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record sign-off');
    }
  }

  async function handleToggleMarketplace(ticket: MaintenanceTicket) {
    setBusyId(ticket.id);
    try {
      await api.setMarketplaceListing(ticket.id, !ticket.openToMarketplace);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update marketplace listing');
    } finally {
      setBusyId(null);
    }
  }

  async function handleExpandQuotes(ticketId: string) {
    if (expandedId === ticketId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ticketId);
    setQuotesLoading(true);
    try {
      const data = await api.getQuotes(ticketId);
      setQuotes(data as RepairQuote[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quotes');
    } finally {
      setQuotesLoading(false);
    }
  }

  async function handleAcceptQuote(quoteId: string, ticketId: string) {
    setBusyId(quoteId);
    try {
      await api.acceptQuote(quoteId);
      const data = await api.getQuotes(ticketId);
      setQuotes(data as RepairQuote[]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept quote');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Maintenance &amp; Repairs</h2>
        <p className="text-sm text-gray-600 mt-1">
          Every complaint a tenant reports — over WhatsApp or logged here directly — becomes a ticket. A repair only
          closes once the tenant signs off that it's actually done.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">Log a new complaint</h3>
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
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Raised by (tenant)</label>
            <input
              value={raisedBy}
              onChange={(e) => setRaisedBy(e.target.value)}
              placeholder="e.g. Musa Bello"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Category (who's responsible)</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Not classified</option>
              {checklist.map((group) => (
                <optgroup key={group.responsibility} label={group.responsibility === 'LANDLORD' ? "Landlord's responsibility" : 'Tenant responsibility'}>
                  {group.sections.flatMap((section) =>
                    section.items.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    )),
                  )}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Generator won't start"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Logging…' : 'Log complaint'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Open &amp; recent tickets</h3>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-sm text-gray-500">Loading…</div>
        ) : tickets.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">No maintenance tickets yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tickets.map((t) => (
              <li key={t.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[t.status] ?? ''}`}>
                        {t.status.replace(/_/g, ' ')}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${responsibilityBadge[t.responsibility ?? 'UNCLEAR'].className}`}>
                        {responsibilityBadge[t.responsibility ?? 'UNCLEAR'].text}
                      </span>
                      {t.openToMarketplace && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-800 border border-purple-200">
                          On marketplace
                        </span>
                      )}
                      <span className="text-sm font-semibold text-gray-900">{t.propertyTitle ?? t.propertyId}</span>
                    </div>
                    {t.categoryLabel && <p className="text-xs text-gray-500">{t.categoryLabel}</p>}
                    <p className="text-sm text-gray-700">{t.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t.raisedBy ? `Reported by ${t.raisedBy}` : 'Reported'} · {new Date(t.createdAt).toLocaleString('en-GB')}
                    </p>
                    {t.sourceMessage && (
                      <p className="text-xs text-gray-400 italic mt-1">"{t.sourceMessage}"</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {t.tenantSignedOff ? (
                      <span className="text-xs font-medium text-emerald-700">✓ Tenant signed off</span>
                    ) : (
                      <button
                        onClick={() => handleSignOff(t.id)}
                        className="text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700"
                      >
                        Mark complete
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleMarketplace(t)}
                      disabled={busyId === t.id}
                      className="text-xs font-medium border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t.openToMarketplace ? 'Remove from marketplace' : 'List on marketplace'}
                    </button>
                    {t.openToMarketplace && (
                      <button onClick={() => handleExpandQuotes(t.id)} className="text-xs text-emerald-700 hover:underline">
                        {expandedId === t.id ? 'Hide quotes' : 'View quotes'}
                      </button>
                    )}
                  </div>
                </div>

                {expandedId === t.id && (
                  <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-4">
                    {quotesLoading ? (
                      <p className="text-xs text-gray-500">Loading quotes…</p>
                    ) : quotes.length === 0 ? (
                      <p className="text-xs text-gray-500">No quotes yet — this job is visible on the public marketplace.</p>
                    ) : (
                      <ul className="space-y-2">
                        {quotes.map((q) => (
                          <li key={q.id} className="flex items-center justify-between text-sm bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <div>
                              <span className="font-medium text-gray-900">{q.handymanName}</span>
                              <span className="text-gray-500"> · {q.handymanPhone} · ₦{q.amount.toLocaleString()}</span>
                              {q.message && <p className="text-xs text-gray-400 italic">"{q.message}"</p>}
                            </div>
                            {q.status === 'ACCEPTED' ? (
                              <span className="text-xs font-medium text-emerald-700">✓ Accepted</span>
                            ) : (
                              <button
                                onClick={() => handleAcceptQuote(q.id, t.id)}
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

export default MaintenancePage;
