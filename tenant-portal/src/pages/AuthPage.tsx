import React, { useState } from 'react';
import { api, setToken } from '../lib/api';

const AuthPage: React.FC<{ onAuthed: () => void }> = ({ onAuthed }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [tenancyId, setTenancyId] = useState('t3');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === 'signup'
          ? await api.signup({ tenancyId, name, email, password })
          : await api.login({ email, password });
      setToken(res.token);
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
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
          <div className="flex mb-6 border border-gray-200 rounded-lg overflow-hidden text-sm font-medium">
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 ${mode === 'signup' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Create account
            </button>
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 ${mode === 'login' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Log in
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Tenancy ID / invite code</label>
                  <input
                    value={tenancyId}
                    onChange={(e) => setTenancyId(e.target.value)}
                    placeholder="e.g. t3"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">Sent to you by your landlord or agent at move-in. Demo IDs: t1, t2, t3.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Full name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === 'signup' ? 8 : undefined}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>

            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
