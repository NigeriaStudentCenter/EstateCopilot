import React, { useState } from 'react';
import { api } from '../lib/api';
import { setToken } from '../lib/auth';

const MARKETING_SIGNUP_URL = import.meta.env.VITE_MARKETING_URL ?? 'http://localhost:5175';

const LoginPage: React.FC<{ onAuthed: () => void }> = ({ onAuthed }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await api.login(email.trim(), password);
      setToken(token);
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 bg-emerald-950 rounded-full"></div>
          <span className="text-xl font-bold text-gray-900">EstateCopilot</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Landlord login</h1>
          <p className="text-sm text-gray-500 mb-6">Sign in with the account you subscribed with.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-6">
            Don't have an account?{' '}
            <a href={`${MARKETING_SIGNUP_URL}/signup`} className="text-emerald-700 font-medium hover:underline">
              List your property
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
