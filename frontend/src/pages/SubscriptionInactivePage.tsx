import React from 'react';
import { clearToken } from '../lib/auth';

const statusCopy: Record<string, { title: string; body: string }> = {
  pending_payment: {
    title: 'Payment not yet confirmed',
    body: "We haven't received confirmation of your first payment yet. If you just signed up, this can take a moment — try refreshing shortly.",
  },
  past_due: {
    title: 'Subscription payment failed',
    body: 'Your last monthly charge didn\'t go through. Update your card on file to restore access to your dashboard.',
  },
  cancelled: {
    title: 'Subscription cancelled',
    body: 'Your subscription is no longer active. Resubscribe to get back into your dashboard.',
  },
};

const SubscriptionInactivePage: React.FC<{ status?: string; onLogout: () => void }> = ({ status, onLogout }) => {
  const key = (status ?? '').toLowerCase();
  const copy = statusCopy[key] ?? { title: 'Subscription inactive', body: 'Your account does not currently have an active subscription.' };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4 text-xl">₦</div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">{copy.title}</h1>
        <p className="text-sm text-gray-600 mb-6">{copy.body}</p>
        <button
          onClick={() => {
            clearToken();
            onLogout();
          }}
          className="text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          Log out
        </button>
      </div>
    </div>
  );
};

export default SubscriptionInactivePage;
