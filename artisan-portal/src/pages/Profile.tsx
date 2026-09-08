import React from 'react';
import { api, ApiError, type Me, type StateDef, type TradeDef } from '../lib/api';
import { compressImage } from '../lib/compressImage';
import { Badge, Button, Card, Field, Screen, input } from '../lib/ui';

export default function Profile({
  me,
  trades,
  states,
  reload,
  flash,
}: {
  me: Me;
  trades: TradeDef[];
  states: StateDef[];
  reload: () => void;
  flash: (t: string) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [bio, setBio] = React.useState(me.bio ?? '');
  const [business, setBusiness] = React.useState(me.businessName ?? '');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const allLgas = Array.from(new Set(states.flatMap((s) => s.lgas))).sort();
  const primary = me.trades.find((t) => t.isPrimary)?.trade;

  async function save(patch: Parameters<typeof api.updateMe>[0], key: string) {
    setBusy(key);
    try {
      await api.updateMe(patch);
      flash('Saved');
      reload();
    } catch (err) {
      flash(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  }

  function toggleTrade(id: string) {
    const has = me.trades.some((t) => t.trade === id);
    const next = has
      ? me.trades.filter((t) => t.trade !== id)
      : [...me.trades, { id: '', trade: id, yearsExperience: 0, isPrimary: me.trades.length === 0 }];
    if (next.length === 0) return flash('Keep at least one trade');
    if (next.length > 6) return flash('Up to 6 trades');
    setBusy('trades');
    api
      .setTrades(next.map((t) => ({ trade: t.trade, yearsExperience: t.yearsExperience, isPrimary: t.isPrimary })))
      .then(() => { flash('Trades updated'); reload(); })
      .catch((e) => flash(e instanceof ApiError ? e.message : 'Could not update'))
      .finally(() => setBusy(null));
  }

  function makePrimary(id: string) {
    setBusy('trades');
    api
      .setTrades(me.trades.map((t) => ({ trade: t.trade, yearsExperience: t.yearsExperience, isPrimary: t.trade === id })))
      .then(() => { flash('Primary set'); reload(); })
      .catch((e) => flash(e instanceof ApiError ? e.message : 'Could not update'))
      .finally(() => setBusy(null));
  }

  function toggleCoverage(lga: string) {
    if (lga === me.baseLga) return;
    const next = me.coverageLgas.includes(lga)
      ? me.coverageLgas.filter((l) => l !== lga)
      : [...me.coverageLgas, lga];
    save({ coverageLgas: next }, 'coverage');
  }

  async function uploadPhotos(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBusy('photos');
    try {
      const shrunk = await Promise.all(files.map(compressImage));
      await api.uploadWorkSamples(shrunk);
      flash('Photos added');
      reload();
    } catch (err) {
      flash(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <Screen title="Your profile">
      <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => uploadPhotos(e.target.files)} />

      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold">{me.name}</p>
            <p className="text-sm text-[#6d7a73]">
              {me.baseLga}, {me.baseState} · {me.phone}
            </p>
          </div>
          <Badge tier={me.verificationTier} />
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <span className="text-[#6d7a73]"><b className="text-[#16241d]">{me.ratingCount ? me.ratingAvg.toFixed(1) : '–'}</b> rating</span>
          <span className="text-[#6d7a73]"><b className="text-[#16241d]">{me.jobsCompleted}</b> jobs</span>
          <span className="text-[#6d7a73]"><b className="text-[#16241d]">{me.score}</b> score</span>
        </div>
        {!me.isListed && (
          <p className="mt-3 rounded-lg bg-ochre-50 px-3 py-2 text-xs text-ochre-700">
            Verify your NIN or BVN below to appear in the public directory and take structural work.
          </p>
        )}
      </Card>

      <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Availability</h2>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {(['OPEN', 'BUSY', 'AWAY'] as const).map((v) => (
          <button
            key={v}
            onClick={() => save({ availability: v }, 'avail')}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              me.availability === v ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'
            }`}
          >
            {v[0] + v.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Trades ({me.trades.length}/6)</h2>
      <p className="mb-2 text-xs text-[#8a948d]">Tap to add or remove. Long-press a chip label to make it primary.</p>
      <Card className="mb-4 p-3">
        {(['STRUCTURAL', 'SYSTEMS'] as const).map((g) => (
          <div key={g} className="mb-2 last:mb-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8a948d]">
              {g === 'STRUCTURAL' ? 'Structural & building shell' : 'Systems & day-to-day'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {trades.filter((t) => t.group === g).map((t) => {
                const on = me.trades.some((x) => x.trade === t.id);
                return (
                  <button
                    key={t.id}
                    disabled={busy === 'trades'}
                    onClick={() => toggleTrade(t.id)}
                    onContextMenu={(e) => { e.preventDefault(); if (on) makePrimary(t.id); }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      primary === t.id
                        ? 'bg-ochre-500 text-white'
                        : on
                          ? 'bg-moss-600/10 text-moss-700'
                          : 'bg-black/5 text-[#6d7a73]'
                    }`}
                  >
                    {t.label}
                    {primary === t.id ? ' ★' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Card>

      <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Coverage LGAs</h2>
      <p className="mb-2 text-xs text-[#8a948d]">Where you'll travel to. {me.baseLga} is always covered.</p>
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-1.5">
          {allLgas.map((l) => {
            const on = l === me.baseLga || me.coverageLgas.includes(l);
            return (
              <button
                key={l}
                disabled={busy === 'coverage' || l === me.baseLga}
                onClick={() => toggleCoverage(l)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  on ? 'bg-moss-600/10 text-moss-700' : 'bg-black/5 text-[#6d7a73]'
                } ${l === me.baseLga ? 'opacity-70' : ''}`}
              >
                {l}
                {l === me.baseLga ? ' (base)' : ''}
              </button>
            );
          })}
        </div>
      </Card>

      <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Photos of your work ({me.workSamples.length}/8)</h2>
      <Card className="mb-4 p-3">
        {me.workSamples.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {me.workSamples.map((w) => (
              <div key={w.id} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-black/10">
                <img src={w.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                <button
                  onClick={() => api.deleteWorkSample(w.imageUrl).then(reload)}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-bold text-white opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          disabled={busy === 'photos' || me.workSamples.length >= 8}
          onClick={() => fileRef.current?.click()}
        >
          {busy === 'photos' ? 'Uploading…' : me.workSamples.length >= 8 ? 'Photo limit reached' : '📷 Add work photos'}
        </Button>
      </Card>

      <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">About</h2>
      <Card className="mb-4 space-y-3 p-4">
        <Field label="Trade / business name">
          <input className={input} value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="e.g. Yaba Sparks Electrical" />
        </Field>
        <Field label="Short bio" hint="One or two lines clients will read.">
          <textarea className={input} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Button disabled={busy === 'about'} onClick={() => save({ businessName: business.trim() || null, bio: bio.trim() || null }, 'about')}>
          {busy === 'about' ? 'Saving…' : 'Save'}
        </Button>
      </Card>

      {me.verificationTier < 1 && <Verify flash={flash} reload={reload} />}
    </Screen>
  );
}

function Verify({ flash, reload }: { flash: (t: string) => void; reload: () => void }) {
  const [kind, setKind] = React.useState<'NIN' | 'BVN'>('NIN');
  const [id, setId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">Get verified</h2>
      <Card className="space-y-3 p-4">
        <p className="text-sm text-[#42504a]">
          We check your NIN or BVN against the national record — name and identity only, the number is never stored.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['NIN', 'BVN'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${kind === k ? 'border-ochre-500 bg-ochre-50 text-ochre-700' : 'border-black/15 text-[#42504a]'}`}
            >
              {k}
            </button>
          ))}
        </div>
        <input
          className={input}
          inputMode="numeric"
          value={id}
          onChange={(e) => setId(e.target.value.replace(/\D/g, ''))}
          placeholder={kind === 'NIN' ? '11-digit NIN' : '11-digit BVN'}
          maxLength={20}
        />
        <Button
          disabled={busy || id.length < 8}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.verifyId(kind, id);
              flash(r.status === 'VERIFIED' ? 'Verified — you\'re in the directory' : 'Name did not match — try the other ID');
              reload();
            } catch (e) {
              flash(e instanceof ApiError ? e.message : 'Verification failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Checking…' : `Verify with ${kind}`}
        </Button>
      </Card>
    </>
  );
}
