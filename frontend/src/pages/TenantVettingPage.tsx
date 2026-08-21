import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Tenancy, KycStatus } from '../types';

const kycMap: Record<KycStatus, { text: string; color: string }> = {
  VERIFIED: { text: 'NIN/BVN Verified', color: 'bg-emerald-100 text-emerald-800' },
  PENDING: { text: 'Verification Pending', color: 'bg-amber-100 text-amber-900' },
  FAILED: { text: 'Verification Failed', color: 'bg-red-100 text-red-800' },
};

const TenantVettingPage: React.FC = () => {
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openFor, setOpenFor] = useState<string | null>(null);
  const [bvn, setBvn] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<Record<string, { matched: boolean; resolvedName: string }>>({});

  function refresh() {
    api
      .getTenancies()
      .then((data) => setTenancies(data as Tenancy[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to reach the backend'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleVerify(tenancyId: string) {
    if (!/^\d{11}$/.test(bvn)) {
      setError('BVN must be exactly 11 digits.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await api.verifyTenantBvn(tenancyId, bvn);
      setResults((prev) => ({ ...prev, [tenancyId]: { matched: res.matched, resolvedName: res.resolvedName } }));
      setBvn('');
      setOpenFor(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify BVN');
    } finally {
      setVerifying(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading tenancies…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Tenant Vetting</h2>
        <p className="text-sm text-gray-600 mt-1">
          Verify a tenant's identity against their Bank Verification Number before they move in — the BVN itself is
          never stored, only whether the name on it matches the tenant on file.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {tenancies.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">No tenancies yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tenancies.map((t) => {
              const status = kycMap[t.kycStatus];
              const result = results[t.id];
              return (
                <li key={t.id} className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900">{t.tenantName}</p>
                      <p className="text-sm text-gray-500">{t.propertyTitle}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.text}</span>
                      {t.kycStatus !== 'VERIFIED' && (
                        <button
                          onClick={() => {
                            setOpenFor(openFor === t.id ? null : t.id);
                            setBvn('');
                          }}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          {openFor === t.id ? 'Cancel' : 'Verify BVN'}
                        </button>
                      )}
                    </div>
                  </div>

                  {result && (
                    <p className={`text-xs mt-2 ${result.matched ? 'text-emerald-700' : 'text-red-700'}`}>
                      {result.matched ? `✓ Matched: ${result.resolvedName}` : `✗ ${result.resolvedName}`}
                    </p>
                  )}

                  {openFor === t.id && (
                    <div className="mt-3 flex flex-col md:flex-row gap-2 items-start">
                      <input
                        value={bvn}
                        onChange={(e) => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="11-digit BVN"
                        inputMode="numeric"
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
                      />
                      <button
                        onClick={() => handleVerify(t.id)}
                        disabled={verifying || bvn.length !== 11}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {verifying ? 'Verifying…' : 'Verify'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TenantVettingPage;
