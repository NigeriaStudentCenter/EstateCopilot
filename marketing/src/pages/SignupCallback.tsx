import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { LANDLORD_PORTAL_URL } from '../lib/links';

// Only reached in real-Paystack mode — Paystack redirects here after a
// landlord completes checkout on their hosted payment page.
const SignupCallback: React.FC = () => {
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reference = params.get('reference') ?? params.get('trxref');
    const landlordId = params.get('landlordId') ?? undefined;
    if (!reference) {
      setError('Missing payment reference — please try signing up again.');
      return;
    }
    api
      .landlordConfirm(reference, landlordId)
      .then(({ token }) => {
        window.location.href = `${LANDLORD_PORTAL_URL}/?token=${encodeURIComponent(token)}`;
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not confirm your payment.'));
  }, [params]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-sm text-center">{error}</p>
      ) : (
        <p className="text-gray-600">Confirming your subscription…</p>
      )}
    </div>
  );
};

export default SignupCallback;
