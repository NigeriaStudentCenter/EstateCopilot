import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Property } from '../types';

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

interface Levy {
  id: string;
  type: string;
  authority: string;
  amountDue: number;
  status: 'CLEARED' | 'ARREARS';
  periodLabel: string;
  clearedAt?: string | null;
}

interface Payment {
  id: string;
  purpose: string;
  amount: number;
  status: string;
  provider: string;
  createdAt: string;
  tenantName?: string;
  propertyTitle?: string;
}

const LEVY_TYPES = ['TENEMENT_RATE', 'LAWMA_ENVIRONMENTAL', 'SIGNAGE_PERMIT', 'OTHER'];

const PaymentsPanel: React.FC = () => {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPayments()
      .then((p) => setPayments(p as Payment[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load payments'));
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Rent received</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Confirmed tenant payments across your tenancies. Money settles straight to your bank via your Paystack
          subaccount — this is just your record of it.
        </p>
      </div>
      {error && <p className="px-6 py-3 text-sm text-red-700 bg-red-50">{error}</p>}
      {payments === null && !error && <p className="px-6 py-6 text-sm text-gray-500">Loading…</p>}
      {payments && payments.length === 0 && (
        <p className="px-6 py-6 text-sm text-gray-500">No payments recorded yet.</p>
      )}
      {payments && payments.length > 0 && (
        <div className="divide-y divide-gray-100">
          {payments.map((p) => (
            <div key={p.id} className="px-6 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{naira.format((p.amount ?? 0) / 100)}</p>
                <p className="text-xs text-gray-500">
                  {p.purpose} · {p.tenantName ?? 'Unknown tenant'}
                  {p.propertyTitle ? ` · ${p.propertyTitle}` : ''}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.status === 'SUCCESSFUL' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {p.status}
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FinanceLeviesPage: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [levies, setLevies] = useState<Levy[]>([]);
  const [audit, setAudit] = useState<{ clearToRelease: boolean; blockingItems: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'TENEMENT_RATE', authority: '', amountDue: '', periodLabel: '' });

  useEffect(() => {
    api
      .getProperties()
      .then((p) => {
        const list = p as Property[];
        setProperties(list);
        if (list.length) setSelectedId(list[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to reach the backend'))
      .finally(() => setLoading(false));
  }, []);

  function refreshLevies(propertyId: string) {
    if (!propertyId) return;
    Promise.all([api.getLevies(propertyId), api.getExitAudit(propertyId)])
      .then(([lv, au]) => {
        setLevies(lv as Levy[]);
        setAudit(au);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load levies'));
  }

  useEffect(() => {
    if (selectedId) refreshLevies(selectedId);
  }, [selectedId]);

  const selected = properties.find((p) => p.id === selectedId);
  const totalArrears = useMemo(
    () => levies.filter((l) => l.status === 'ARREARS').reduce((s, l) => s + l.amountDue, 0),
    [levies],
  );

  async function handleToggle(levy: Levy) {
    setBusy(true);
    setError(null);
    try {
      await api.setLevyStatus(selectedId, levy.id, levy.status === 'ARREARS' ? 'CLEARED' : 'ARREARS');
      refreshLevies(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the levy');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amountDue);
    if (!form.authority.trim() || !form.periodLabel.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Fill in authority, a period label, and a positive amount.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addLevy(selectedId, {
        type: form.type,
        authority: form.authority.trim(),
        amountDue: Math.round(amount),
        periodLabel: form.periodLabel.trim(),
      });
      setForm({ type: 'TENEMENT_RATE', authority: '', amountDue: '', periodLabel: '' });
      setShowForm(false);
      refreshLevies(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the levy');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading finance…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Finance &amp; Levies</h2>
        <p className="text-sm text-gray-600 mt-1">
          Rent received across your tenancies, and the municipal levies on each property — Tenement Rate, LAWMA and the
          rest. A caution deposit can't be released while any levy on that property is still in arrears.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <PaymentsPanel />

      {properties.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 text-center text-sm text-gray-500">
          Add a property first — levies are tracked per property.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 uppercase">Property</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — {p.lga}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
            >
              {showForm ? 'Close' : 'Add a levy'}
            </button>
          </div>

          {selected && (
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-500">
                Municipal ID: <span className="text-gray-800">{selected.municipalId || '—'}</span>
              </span>
              <span className="text-gray-500">
                Outstanding: <span className={totalArrears ? 'text-red-700 font-semibold' : 'text-gray-800'}>{naira.format(totalArrears)}</span>
              </span>
              {audit && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    audit.clearToRelease ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {audit.clearToRelease ? 'Deposit release: clear' : `Deposit release: blocked (${audit.blockingItems.length})`}
                </span>
              )}
            </div>
          )}

          {showForm && (
            <form onSubmit={handleAdd} className="px-6 py-4 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {LEVY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Authority</label>
                <input
                  value={form.authority}
                  onChange={(e) => setForm({ ...form, authority: e.target.value })}
                  placeholder="e.g. Eti-Osa LGA"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Amount due (₦)</label>
                <input
                  value={form.amountDue}
                  onChange={(e) => setForm({ ...form, amountDue: e.target.value })}
                  type="number"
                  min={1}
                  placeholder="180000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Period</label>
                <input
                  value={form.periodLabel}
                  onChange={(e) => setForm({ ...form, periodLabel: e.target.value })}
                  placeholder="2026 Assessment"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save levy'}
                </button>
              </div>
            </form>
          )}

          {levies.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500 text-center">No levies recorded for this property.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {levies.map((l) => (
                <div key={l.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {l.type.replace(/_/g, ' ')} <span className="text-gray-400">·</span> {l.periodLabel}
                    </p>
                    <p className="text-xs text-gray-500">{l.authority}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-800 tabular-nums">{naira.format(l.amountDue)}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        l.status === 'CLEARED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {l.status}
                    </span>
                    <button
                      onClick={() => handleToggle(l)}
                      disabled={busy}
                      className="text-xs font-medium border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {l.status === 'ARREARS' ? 'Mark cleared' : 'Mark arrears'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinanceLeviesPage;
