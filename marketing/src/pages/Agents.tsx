import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { agentApi, agentSession } from '../lib/agent';

const STEPS = [
  { n: '1', title: 'Register and pick your states', body: 'Free to join. Choose the states you work in — Lagos, Abuja, Ogun, anywhere.' },
  { n: '2', title: 'Get alerted to new listings', body: 'The moment a verified landlord lists a property in your states, it lands in your dashboard and inbox.' },
  { n: '3', title: 'Share your personal link', body: 'Every listing comes with your own link. Send it to clients on WhatsApp, Instagram, anywhere.' },
  { n: '4', title: 'Your clients become your leads', body: 'When someone requests a viewing through your link, you get their name and number straight away.' },
  { n: '5', title: 'Close the deal, get paid', body: 'Record the deal, the landlord confirms in one click, the tenant pays the agent fee securely — and your share goes straight to your bank.' },
];

const Agents: React.FC = () => {
  const [pct, setPct] = useState<number | null>(null);
  const signedIn = !!agentSession.get();
  useEffect(() => {
    agentApi.terms().then((t) => setPct(t.commissionPercent)).catch(() => {});
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-b from-emerald-900 to-emerald-800 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <p className="text-sm font-semibold text-emerald-300 uppercase tracking-wide mb-3">For estate agents</p>
          <h1 className="font-serif text-3xl md:text-5xl font-bold leading-tight mb-4 max-w-3xl">
            Verified listings. Real leads. Paid on time.
          </h1>
          <p className="text-emerald-100 text-lg max-w-2xl mb-8">
            Get alerted the moment a landlord lists a property in your area, share it with your clients, and collect your agent
            fee through EstateCopilot — no chasing, no cash in envelopes.
          </p>
          <div className="flex flex-wrap gap-3">
            {signedIn ? (
              <Link to="/agents/dashboard" className="bg-white text-emerald-900 px-6 py-3 rounded-lg font-semibold hover:bg-emerald-50">
                Open my dashboard
              </Link>
            ) : (
              <>
                <Link to="/agents/join" className="bg-white text-emerald-900 px-6 py-3 rounded-lg font-semibold hover:bg-emerald-50">
                  Join free as an agent
                </Link>
                <Link to="/agents/login" className="border border-emerald-300 text-white px-6 py-3 rounded-lg font-semibold hover:bg-emerald-700">
                  Agent sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-gray-900 mb-8">How it works</h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center mb-3">{s.n}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
              <p className="text-sm text-gray-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-3">How you get paid</h2>
            <p className="text-gray-600 mb-3">
              Each listing shows the agent fee the landlord has agreed — usually 10% of the annual rent, paid by the tenant.
            </p>
            <p className="text-gray-600">
              The tenant pays the fee to EstateCopilot through Paystack (card, transfer or USSD). Paystack splits it on the spot:
              {pct !== null ? ` ${100 - pct}% goes straight to your bank account and EstateCopilot keeps ${pct}%.` : ' your share goes straight to your bank account and EstateCopilot keeps a small commission.'}
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-sm">
            <p className="font-semibold text-emerald-900 mb-3">Example: a ₦4,000,000/year flat</p>
            <div className="space-y-2 text-emerald-900">
              <div className="flex justify-between"><span>Agent fee (10%) paid by tenant</span><span className="font-semibold">₦400,000</span></div>
              {pct !== null && (
                <>
                  <div className="flex justify-between"><span>EstateCopilot ({pct}%)</span><span>₦{(4000 * pct).toLocaleString()}</span></div>
                  <div className="flex justify-between border-t border-emerald-200 pt-2"><span>Paid to you</span><span className="font-bold">₦{(400000 - 4000 * pct).toLocaleString()}</span></div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Agents;

// ---- Register / sign in -----------------------------------------------------

export const AgentAuth: React.FC<{ mode: 'join' | 'login' }> = ({ mode }) => {
  const navigate = useNavigate();
  const [states, setStates] = useState<string[]>([]);
  const [allStates, setAllStates] = useState<{ name: string }[]>([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', agencyName: '', licenceNumber: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (agentSession.get()) navigate('/agents/dashboard', { replace: true });
    if (mode === 'join') {
      import('../lib/api').then(({ api }) => api.getStates().then(setAllStates).catch(() => {}));
    }
  }, [mode, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'join' && states.length === 0) {
      setError('Pick at least one state you work in.');
      return;
    }
    setSubmitting(true);
    try {
      const res =
        mode === 'join'
          ? await agentApi.register({
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone.trim(),
              password: form.password,
              agencyName: form.agencyName.trim() || undefined,
              licenceNumber: form.licenceNumber.trim() || undefined,
              states,
            })
          : await agentApi.login(form.email.trim(), form.password);
      agentSession.set(res.token);
      navigate(mode === 'join' ? '/agents/dashboard?welcome=1' : '/agents/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';
  const label = 'block text-xs font-medium text-gray-500 uppercase mb-1';

  return (
    <div className="min-h-[70vh] bg-gray-50 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">EstateCopilot for agents</p>
          <h1 className="font-serif text-3xl font-bold text-gray-900">{mode === 'join' ? 'Join free' : 'Welcome back'}</h1>
          <p className="text-gray-600 mt-2">
            {mode === 'join' ? 'Get alerted to new listings in your area and get paid through EstateCopilot.' : 'Sign in to your agent dashboard.'}
          </p>
        </div>
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 sm:p-8 space-y-4">
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {mode === 'join' && (
            <>
              <div>
                <label htmlFor="agent-name" className={label}>Full name</label>
                <input id="agent-name" value={form.name} onChange={set('name')} required minLength={2} className={input} autoComplete="name" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="agent-agencyName" className={label}>Agency (optional)</label>
                  <input id="agent-agencyName" value={form.agencyName} onChange={set('agencyName')} className={input} autoComplete="organization" />
                </div>
                <div>
                  <label htmlFor="agent-licenceNumber" className={label}>ESVARBON / NIESV no. (optional)</label>
                  <input id="agent-licenceNumber" value={form.licenceNumber} onChange={set('licenceNumber')} className={input} />
                </div>
              </div>
            </>
          )}
          <div>
            <label htmlFor="agent-email" className={label}>Email</label>
            <input id="agent-email" value={form.email} onChange={set('email')} type="email" required className={input} autoComplete="email" />
          </div>
          {mode === 'join' && (
            <div>
              <label htmlFor="agent-phone" className={label}>Phone (WhatsApp)</label>
              <input id="agent-phone" value={form.phone} onChange={set('phone')} required minLength={10} className={input} autoComplete="tel" placeholder="0803 000 0000" />
            </div>
          )}
          <div>
            <label htmlFor="agent-password" className={label}>Password</label>
            <input id="agent-password" value={form.password} onChange={set('password')} type="password" required minLength={mode === 'join' ? 8 : 1} className={input} autoComplete={mode === 'join' ? 'new-password' : 'current-password'} />
            {mode === 'join' && <p className="text-xs text-gray-400 mt-1">At least 8 characters.</p>}
          </div>
          {mode === 'join' && (
            <div>
              <label className={label}>States you work in</label>
              <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {allStates.map((s) => (
                  <label key={s.name} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      aria-label={s.name}
                      checked={states.includes(s.name)}
                      onChange={(e) => setStates(e.target.checked ? [...states, s.name] : states.filter((x) => x !== s.name))}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">{states.length ? `${states.length} selected — ` : ''}you'll be alerted to new listings in these states.</p>
            </div>
          )}
          <button type="submit" disabled={submitting} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {submitting ? 'Please wait…' : mode === 'join' ? 'Create my agent account' : 'Sign in'}
          </button>
          <p className="text-sm text-center text-gray-500">
            {mode === 'join' ? (
              <>Already registered? <Link to="/agents/login" className="text-emerald-700 font-medium">Sign in</Link></>
            ) : (
              <>New here? <Link to="/agents/join" className="text-emerald-700 font-medium">Join free as an agent</Link></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
};
