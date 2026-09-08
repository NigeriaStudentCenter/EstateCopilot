import React from 'react';
import { api, ApiError, type Me, type StateDef, type TradeDef } from './lib/api';
import { getToken, clearToken } from './lib/auth';
import { Toast } from './lib/ui';
import Login from './pages/Login';
import Jobs from './pages/Jobs';
import Profile from './pages/Profile';

type Tab = 'jobs' | 'profile';

export default function App() {
  const [authed, setAuthed] = React.useState(!!getToken());
  const [me, setMe] = React.useState<Me | null>(null);
  const [trades, setTrades] = React.useState<TradeDef[]>([]);
  const [states, setStates] = React.useState<StateDef[]>([]);
  const [tab, setTab] = React.useState<Tab>('jobs');
  const [toast, setToast] = React.useState<string | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);

  const flash = React.useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const reload = React.useCallback(() => {
    api
      .me()
      .then(setMe)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          clearToken();
          setAuthed(false);
        } else {
          setLoadErr(e instanceof Error ? e.message : 'Could not reach the server');
        }
      });
  }, []);

  React.useEffect(() => {
    if (!authed) return;
    api.trades().then(setTrades).catch(() => {});
    api.states().then(setStates).catch(() => {});
    reload();
  }, [authed, reload]);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  if (loadErr) return <div className="p-6 text-sm text-ochre-700">{loadErr}</div>;
  if (!me) return <div className="p-6 text-sm text-[#8a948d]">Loading…</div>;

  const setupNeeded = me.trades.length === 0 || me.verificationTier < 1;

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <header className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ochre-500 text-xs font-extrabold text-white">EC</span>
          <b className="text-sm">Artisans</b>
        </div>
        <button onClick={() => { clearToken(); setAuthed(false); }} className="text-xs font-medium text-[#8a948d]">
          Sign out
        </button>
      </header>

      {setupNeeded && tab === 'jobs' && (
        <div className="mx-4 mb-3 rounded-xl border border-ochre-100 bg-ochre-50 p-3 text-sm text-ochre-700">
          <b>Finish setting up</b> — {me.trades.length === 0 ? 'add your trades' : 'verify your NIN/BVN'} on the{' '}
          <button className="font-semibold underline" onClick={() => setTab('profile')}>Profile</button> tab so you get matched and listed.
        </div>
      )}

      {tab === 'jobs' ? (
        <Jobs me={me} flash={flash} />
      ) : (
        <Profile me={me} trades={trades} states={states} reload={reload} flash={flash} />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-2 pb-[env(safe-area-inset-bottom)]">
          {([
            ['jobs', 'Jobs', '🧰'],
            ['profile', 'Profile', '👤'],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                tab === id ? 'text-ochre-600' : 'text-[#8a948d]'
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>

      <Toast text={toast} />
    </div>
  );
}
