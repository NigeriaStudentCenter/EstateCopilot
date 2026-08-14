import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank (FCMB)', code: '214' },
  { name: 'Guaranty Trust Bank (GTBank)', code: '058' },
  { name: 'Kuda Bank', code: '50211' },
  { name: 'Moniepoint MFB', code: '50515' },
  { name: 'Opay', code: '999992' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa (UBA)', code: '033' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
];

const SettingsPage: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [accountName, setAccountName] = useState<string | undefined>();
  const [accountNumber, setAccountNumber] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const [bankCode, setBankCode] = useState(NIGERIAN_BANKS[0].code);
  const [inputAccountNumber, setInputAccountNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api
      .getMe()
      .then((me) => {
        setConnected(me.paystackConnected);
        setAccountName(me.bankAccountName);
        setAccountNumber(me.bankAccountNumber);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inputAccountNumber.length !== 10) return;
    setSubmitting(true);
    setError(null);
    try {
      const bankName = NIGERIAN_BANKS.find((b) => b.code === bankCode)?.name ?? '';
      const res = await api.saveBankDetails({ bankAccountNumber: inputAccountNumber, bankCode, bankName });
      setConnected(true);
      setAccountName(res.bankAccountName);
      setAccountNumber(res.bankAccountNumber);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect that account');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading settings…</div>;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Connect your own bank account so rent paid by tenants lands with you directly — EstateCopilot never holds
          or routes that money.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Payout account</h3>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        {connected && success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3">
            ✓ Your account is connected. Rent from your tenants will settle directly into this account.
          </div>
        )}

        {connected && (
          <div className="text-sm text-gray-600 border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
            <p className="font-medium text-gray-900">{accountName}</p>
            <p>Account ending in {accountNumber?.slice(-4)}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">{connected ? 'Replace with a different account' : 'Enter your bank details to connect a payout account'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Bank</label>
              <select
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {NIGERIAN_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Account number</label>
              <input
                value={inputAccountNumber}
                onChange={(e) => setInputAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="0123456789"
                inputMode="numeric"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || inputAccountNumber.length !== 10}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Verifying…' : connected ? 'Update account' : 'Connect account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SettingsPage;
