import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Agreement {
  tenancyId: string;
  status: 'SENT' | 'SIGNED';
  content: string;
  initiatedAt: string;
  signedAt?: string;
  signedByName?: string;
}

const AgreementPage: React.FC = () => {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    api
      .getAgreement()
      .then((data) => setAgreement(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your tenancy agreement'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !confirmed) return;
    setSigning(true);
    setError(null);
    try {
      const res = await api.signAgreement(fullName.trim());
      setAgreement(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign — please try again');
    } finally {
      setSigning(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  if (!agreement) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
        <p className="text-sm text-gray-500">
          Your landlord hasn't sent your tenancy agreement yet. Check back once they do — you'll be able to review and sign it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Tenancy agreement</h2>
        <p className="text-sm text-gray-600 mt-1">
          {agreement.status === 'SIGNED'
            ? 'You have signed this agreement.'
            : 'Please review the terms below, then sign to confirm you agree.'}
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">{agreement.content}</pre>
      </div>

      {agreement.status === 'SIGNED' ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl shrink-0">✓</div>
          <div>
            <p className="font-medium text-emerald-900">Signed by {agreement.signedByName}</p>
            <p className="text-sm text-emerald-700">{new Date(agreement.signedAt!).toLocaleString('en-GB')}</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSign} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Sign this agreement</h3>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Type your full legal name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I have read and agree to the terms of this tenancy agreement.
          </label>
          <button
            type="submit"
            disabled={signing || !fullName.trim() || !confirmed}
            className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {signing ? 'Signing…' : 'Sign agreement'}
          </button>
        </form>
      )}
    </div>
  );
};

export default AgreementPage;
