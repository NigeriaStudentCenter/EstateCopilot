import React, { useState } from 'react';
import { api } from '../lib/api';
import { getStoredRef } from '../lib/referral';
import { LANDLORD_PORTAL_URL } from '../lib/links';
import StateSelect from '../components/StateSelect';

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

type Step = 'form' | 'pay' | 'redirecting';

const Signup: React.FC = () => {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const [hostedPageUrl, setHostedPageUrl] = useState<string | null>(null);
  const [amountKobo, setAmountKobo] = useState(1_000_000);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.landlordSignup({ name: name.trim(), email: email.trim(), phone: phone.trim(), password, state, ref: getStoredRef() });
      setAmountKobo(res.monthlyAmountKobo);
      if (res.authorizationUrl) {
        // Real Paystack subscription mode: hand off to their hosted checkout entirely.
        window.location.href = res.authorizationUrl;
        return;
      }
      setReference(res.reference);
      setHostedPageUrl(res.hostedPageUrl);
      setStep('pay');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmPayment() {
    if (!reference) return;
    setSubmitting(true);
    setError(null);
    try {
      const { token } = await api.landlordConfirm(reference);
      setStep('redirecting');
      window.location.href = `${LANDLORD_PORTAL_URL}/?token=${encodeURIComponent(token)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment confirmation failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[70vh] bg-gray-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">List your property</p>
          <h1 className="font-serif text-3xl font-bold text-gray-900">One flat fee. Everything included.</h1>
          <p className="text-gray-600 mt-2">
            {currencyFormatter.format(amountKobo / 100)}/month — tenant vetting, rent collection, repairs, and
            correspondence, all running for every property you list.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8">
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}

          {step === 'form' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Full name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Phone (WhatsApp)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Password</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">State</label>
                <StateSelect value={state} onChange={setState} includeAll={false} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
                <p className="text-xs text-gray-400 mt-1">Your properties will be listed on this state's page by default.</p>
              </div>
              <button type="submit" disabled={submitting} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {submitting ? 'Please wait…' : `Continue to payment — ${currencyFormatter.format(amountKobo / 100)}/mo`}
              </button>
              <p className="text-xs text-gray-400 text-center">Billed monthly via Paystack. Cancel anytime from your dashboard.</p>
            </form>
          )}

          {step === 'pay' && (
            <div className="space-y-5 text-center">
              <div className="border border-gray-200 rounded-lg p-5">
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Subscription</p>
                <p className="text-2xl font-bold text-gray-900">{currencyFormatter.format(amountKobo / 100)}<span className="text-sm font-normal text-gray-500">/month</span></p>
                <p className="text-xs text-gray-400 mt-1">Account created for {email}</p>
              </div>

              {hostedPageUrl && (
                <>
                  <a
                    href={hostedPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700"
                  >
                    Pay {currencyFormatter.format(amountKobo / 100)}/month on Paystack ↗
                  </a>
                  <p className="text-xs text-gray-500">
                    Pay on Paystack&rsquo;s secure page, then come back. We activate your account once the payment
                    clears — usually within a few hours — and email you when the portal is ready.
                  </p>
                  <a
                    href={`${LANDLORD_PORTAL_URL}/`}
                    className="block w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50"
                  >
                    I&rsquo;ve paid — go to the login page
                  </a>
                </>
              )}

              {reference && (
                <button
                  onClick={handleConfirmPayment}
                  disabled={submitting}
                  className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-xs font-semibold hover:bg-gray-800 disabled:opacity-50"
                >
                  {submitting ? 'Confirming…' : 'Sandbox: confirm mock payment now'}
                </button>
              )}
            </div>
          )}

          {step === 'redirecting' && (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
              <p className="font-medium text-gray-900">Subscription active — taking you to your dashboard…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Signup;
