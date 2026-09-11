import React from 'react';
import { api, ApiError, type StateDef } from '../lib/api';
import { setToken } from '../lib/auth';
import { Button, Field, input } from '../lib/ui';

export default function Login({ onDone }: { onDone: () => void }) {
  const [step, setStep] = React.useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [devOtp, setDevOtp] = React.useState<string>();
  const [needProfile, setNeedProfile] = React.useState(false);
  const [name, setName] = React.useState('');
  const [states, setStates] = React.useState<StateDef[]>([]);
  const [stateName, setStateName] = React.useState('');
  const [lga, setLga] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.states().then(setStates).catch(() => {});
  }, []);
  const lgas = states.find((s) => s.name === stateName)?.lgas ?? [];

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.requestOtp(phone.trim());
      setDevOtp(r.devOtp);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a code');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.verifyOtp({
        phone: phone.trim(),
        code: code.trim(),
        ...(needProfile ? { name: name.trim(), state: stateName, lga } : {}),
      });
      setToken(r.token);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setNeedProfile(true);
        setError('New here — a few details to set up your account.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not verify that code');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ochre-500 text-2xl font-extrabold text-white">
          EC
        </div>
        <h1 className="text-2xl font-extrabold">Artisan sign-in</h1>
        <p className="mt-1 text-sm text-[#6d7a73]">Get matched jobs. Send quotes. Get paid to your bank.</p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-ochre-100 bg-ochre-50 px-3 py-2 text-sm text-ochre-700">{error}</p>
      )}

      {step === 'phone' ? (
        <form onSubmit={sendCode} className="space-y-4">
          <Field label="Phone number" hint="No invite needed — enter your number and we'll text you a code.">
            <input
              className={input}
              inputMode="tel"
              autoFocus
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0803 000 0000"
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <Field label="6-digit code" hint={devOtp ? `Dev mode: your code is ${devOtp}` : `Sent to ${phone}`}>
            <input
              className={`${input} text-center text-lg tracking-[0.5em]`}
              inputMode="numeric"
              maxLength={6}
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
          </Field>

          {needProfile && (
            <>
              <Field label="Your name / trade name">
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emeka, Yaba Sparks" required />
              </Field>
              <Field label="Base state">
                <select className={input} value={stateName} onChange={(e) => { setStateName(e.target.value); setLga(''); }} required>
                  <option value="">Select…</option>
                  {states.map((s) => <option key={s.slug} value={s.name}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Base LGA">
                <select className={input} value={lga} onChange={(e) => setLga(e.target.value)} required disabled={!lgas.length}>
                  <option value="">Select…</option>
                  {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </>
          )}

          <Button type="submit" disabled={busy || code.length !== 6 || (needProfile && (!name || !stateName || !lga))}>
            {busy ? 'Checking…' : needProfile ? 'Create my account' : 'Continue'}
          </Button>
          <button type="button" onClick={() => { setStep('phone'); setNeedProfile(false); setError(null); }} className="w-full py-2 text-center text-xs text-[#8a948d]">
            Change number
          </button>
        </form>
      )}
    </div>
  );
}
