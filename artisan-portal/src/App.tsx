import React from 'react';
import { api, ApiError, type Me, type StateDef, type TradeDef } from './lib/api';
import { getToken, clearToken } from './lib/auth';
import { Toast } from './lib/ui';
import Login from './pages/Login';
import Diagnose from './pages/Diagnose';
import Home from './pages/Home';
import Jobs from './pages/Jobs';
import Profile from './pages/Profile';
import Tools, { TOOL_INFO, toolsFor } from './pages/tools/Tools';

type Tab = 'home' | 'diagnose' | 'tools' | 'jobs' | 'profile';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function initialTab(): Tab {
  const q = new URLSearchParams(window.location.search);
  const t = q.get('tab');
  if (q.get('dx')) return 'diagnose'; // returning from Paystack lands on the diagnosis
  if (t === 'solar') return 'tools'; // the Solar tab became the Tools tab
  return t === 'jobs' || t === 'profile' || t === 'diagnose' || t === 'tools' ? t : 'home';
}

export default function App() {
  const [authed, setAuthed] = React.useState(!!getToken());
  const [me, setMe] = React.useState<Me | null>(null);
  const [trades, setTrades] = React.useState<TradeDef[]>([]);
  const [states, setStates] = React.useState<StateDef[]>([]);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  // Paystack sends the artisan back to /?tab=diagnose&dx=<diagnosis id> after paying for parts.
  const [dx, setDx] = React.useState<string | null>(() => new URLSearchParams(window.location.search).get('dx'));
  React.useEffect(() => { if (dx) window.history.replaceState({}, '', window.location.pathname); }, [dx]);
  const [installEvt, setInstallEvt] = React.useState<InstallEvent | null>(null);
  const [installed, setInstalled] = React.useState(isStandalone());
  const [toast, setToast] = React.useState<string | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);

  const flash = React.useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2000);
  }, []);

  React.useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
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

  // The calculators follow the trades on the profile (solar, building materials, AC sizing).
  const toolList = toolsFor(me);
  const hasTools = toolList.length > 0;
  const toolTab = toolList.length === 1 ? ([TOOL_INFO[toolList[0]].label, TOOL_INFO[toolList[0]].icon] as const) : (['Tools', '🧮'] as const);
  const setupNeeded = me.trades.length === 0 || me.verificationTier < 1;

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <header className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ochre-500 text-xs font-extrabold text-white">EC</span>
          <b className="text-sm">Artisans</b>
        </div>
        <div className="flex items-center gap-3">
          {installEvt && !installed && (
            <button onClick={() => { void installEvt.prompt(); }} className="rounded-full bg-ochre-500 px-3 py-1 text-xs font-semibold text-white">Install app</button>
          )}
          <button onClick={() => { clearToken(); setAuthed(false); }} className="text-xs font-medium text-[#8a948d]">
            Sign out
          </button>
        </div>
      </header>

      {isIos() && !installed && tab === 'diagnose' && (
        <div className="mx-4 mb-3 rounded-xl border border-black/10 bg-black/5 p-3 text-xs text-[#42504a]">Install this app: tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</div>
      )}

      {setupNeeded && tab !== 'profile' && (
        <div className="mx-4 mb-3 rounded-xl border border-ochre-100 bg-ochre-50 p-3 text-sm text-ochre-700">
          <b>Finish setting up</b> — {me.trades.length === 0 ? 'add your trades' : 'verify your NIN/BVN'} on the{' '}
          <button className="font-semibold underline" onClick={() => setTab('profile')}>Profile</button> tab so you get matched and listed.
        </div>
      )}

      {tab === 'home' ? (
        <Home me={me} flash={flash} go={setTab} reload={reload} />
      ) : tab === 'diagnose' ? (
        <Diagnose me={me} flash={flash} initialId={dx} />
      ) : tab === 'tools' && hasTools ? (
        <Tools me={me} flash={flash} openDiagnosis={(id) => { setDx(id); setTab('diagnose'); window.scrollTo(0, 0); }} />
      ) : tab === 'jobs' ? (
        <Jobs me={me} flash={flash} />
      ) : (
        <Profile me={me} trades={trades} states={states} reload={reload} flash={flash} />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-white/95 backdrop-blur">
        <div className={`mx-auto grid max-w-md ${hasTools ? 'grid-cols-5' : 'grid-cols-4'} pb-[env(safe-area-inset-bottom)]`}>
          {([
            ['home', 'Home', '🏠'],
            ['diagnose', 'Diagnose', '📷'],
            ...(hasTools ? ([['tools', toolTab[0], toolTab[1]]] as const) : []),
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
