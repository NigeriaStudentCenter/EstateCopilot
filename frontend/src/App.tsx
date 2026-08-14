import React, { useEffect, useState } from 'react';
import Dashboard from './Dashboard';
import LoginPage from './pages/LoginPage';
import SubscriptionInactivePage from './pages/SubscriptionInactivePage';
import { api, ApiError } from './lib/api';
import { consumeUrlToken, getToken, clearToken } from './lib/auth';

type AuthState =
  | { status: 'checking' }
  | { status: 'unauthenticated' }
  | { status: 'inactive'; subscriptionStatus?: string }
  | { status: 'authed'; landlord: { name: string; email: string; subscriptionStatus: string } }
  | { status: 'error'; message: string };

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' });

  async function checkAuth() {
    consumeUrlToken();
    if (!getToken()) {
      setAuth({ status: 'unauthenticated' });
      return;
    }
    try {
      const me = await api.getMe();
      setAuth({ status: 'authed', landlord: me });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setAuth({ status: 'inactive', subscriptionStatus: err.subscriptionStatus });
      } else if (err instanceof ApiError && err.status === 401) {
        setAuth({ status: 'unauthenticated' });
      } else {
        setAuth({ status: 'error', message: err instanceof Error ? err.message : 'Failed to reach the backend' });
      }
    }
  }

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (auth.status === 'checking') {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>;
  }

  if (auth.status === 'unauthenticated') {
    return <LoginPage onAuthed={checkAuth} />;
  }

  if (auth.status === 'inactive') {
    return <SubscriptionInactivePage status={auth.subscriptionStatus} onLogout={() => setAuth({ status: 'unauthenticated' })} />;
  }

  if (auth.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{auth.message}</p>
          <button onClick={checkAuth} className="text-sm font-medium text-emerald-700 hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      landlord={auth.landlord}
      onLogout={() => {
        clearToken();
        setAuth({ status: 'unauthenticated' });
      }}
    />
  );
};

export default App;
