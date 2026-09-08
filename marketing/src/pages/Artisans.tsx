import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import StateSelect from '../components/StateSelect';

interface TradeDef {
  id: string;
  label: string;
  group: string;
  blurb: string;
}

interface ArtisanCard {
  id: string;
  name: string;
  businessName?: string | null;
  photoUrl?: string | null;
  primaryTrade?: { id: string; label: string } | null;
  tradeLabels: string[];
  baseState: string;
  baseLga: string;
  coverageLgas: string[];
  skillLevel: 'HAND' | 'TRADESMAN' | 'MASTER';
  availability: 'OPEN' | 'BUSY' | 'AWAY';
  verificationTier: number;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  score: number;
  heroPhoto?: string | null;
  photoCount: number;
}

export const TIER_META: Record<number, { label: string; className: string }> = {
  1: { label: 'ID-verified', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  2: { label: 'Reference-checked', className: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  3: { label: 'EC-Certified', className: 'bg-amber-50 text-amber-900 border-amber-300' },
};

const AVAIL_META: Record<string, { label: string; dot: string; text: string }> = {
  OPEN: { label: 'Available now', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  BUSY: { label: 'Busy — booking ahead', dot: 'bg-amber-500', text: 'text-amber-700' },
  AWAY: { label: 'Away', dot: 'bg-gray-400', text: 'text-gray-500' },
};

export const Stars: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={`inline-flex items-center ${className ?? ''}`} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-hidden>
          <defs>
            <linearGradient id={`half-${i}`}>
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path
            d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z"
            fill={rounded >= i ? 'currentColor' : rounded >= i - 0.5 ? `url(#half-${i})` : 'transparent'}
            stroke="currentColor"
            strokeWidth="1"
            className="text-amber-500"
          />
        </svg>
      ))}
    </span>
  );
};

export const ScoreChip: React.FC<{ score: number }> = ({ score }) => (
  <span
    title="EstateCopilot Score — blends verified rating, jobs completed, verification tier and recent activity into one 0–100 number."
    className="inline-flex items-baseline gap-1 rounded-md bg-gray-900 text-white px-2 py-0.5 text-xs font-mono"
  >
    <span className="opacity-60">EC</span>
    <span className="font-semibold tabular-nums">{score}</span>
  </span>
);

const coverageLine = (a: Pick<ArtisanCard, 'baseLga' | 'coverageLgas'>) =>
  Array.from(new Set([a.baseLga, ...a.coverageLgas])).join(' · ');

const Artisans: React.FC = () => {
  const { stateSlug } = useParams<{ stateSlug?: string }>();
  const navigate = useNavigate();
  const [trades, setTrades] = useState<TradeDef[]>([]);
  const [trade, setTrade] = useState('');
  const [sort, setSort] = useState('score');
  const [artisans, setArtisans] = useState<ArtisanCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stateName, setStateName] = useState<string | null>(null);

  useEffect(() => {
    api.getArtisanTrades().then(setTrades).catch(() => setTrades([]));
  }, []);

  useEffect(() => {
    setArtisans(null);
    setError(null);
    api
      .getArtisans({ trade: trade || undefined, state: stateSlug || undefined, sort })
      .then((r) => setArtisans(r.artisans as ArtisanCard[]))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load artisans'));
    if (stateSlug) api.getStates().then((s) => setStateName(s.find((x) => x.slug === stateSlug)?.name ?? null));
    else setStateName(null);
  }, [trade, stateSlug, sort]);

  const grouped = useMemo(() => {
    const structural = trades.filter((t) => t.group === 'STRUCTURAL');
    const systems = trades.filter((t) => t.group === 'SYSTEMS');
    return { structural, systems };
  }, [trades]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
      <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">For landlords &amp; tenants</p>
      <h1 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-3">
        {stateName ? `Verified artisans in ${stateName}` : 'Find a verified artisan'}
      </h1>
      <p className="text-gray-600 max-w-2xl mb-8">
        Every artisan here has passed an ID check at minimum. Filter by trade and area, compare their
        track record, then call them directly or send a quote request — no marketplace job needed.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-10">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase">Trade</span>
          <select
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[12rem]"
          >
            <option value="">All trades</option>
            <optgroup label="Structure &amp; finishing">
              {grouped.structural.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Systems &amp; services">
              {grouped.systems.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase">Area</span>
          <StateSelect
            value={stateSlug ?? ''}
            onChange={(slug) => navigate(slug ? `/artisans/${slug}` : '/artisans')}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 uppercase">Sort by</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="score">Best match</option>
            <option value="rating">Highest rated</option>
            <option value="jobs">Most jobs done</option>
            <option value="recent">Recently active</option>
          </select>
        </label>

        <Link to="/handymen" className="ml-auto text-sm text-emerald-700 hover:underline self-center">
          Are you an artisan? See open jobs →
        </Link>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}

      {artisans === null ? (
        <p className="text-sm text-gray-500">Loading artisans…</p>
      ) : artisans.length === 0 ? (
        <div className="border border-gray-200 rounded-xl p-12 text-center text-gray-500">
          No verified artisans match that yet.{' '}
          {(trade || stateSlug) && (
            <button onClick={() => { setTrade(''); navigate('/artisans'); }} className="text-emerald-700 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {artisans.map((a) => {
            const tier = TIER_META[a.verificationTier];
            const avail = AVAIL_META[a.availability];
            return (
              <Link
                key={a.id}
                to={`/artisan/${a.id}`}
                className="group border border-gray-200 rounded-xl overflow-hidden flex flex-col hover:border-emerald-300 hover:shadow-sm transition"
              >
                <div className="h-36 bg-gray-100 relative overflow-hidden">
                  {a.heroPhoto ? (
                    <img src={a.heroPhoto} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl font-serif">
                      {a.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    {tier && (
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${tier.className}`}>
                        {tier.label}
                      </span>
                    )}
                  </div>
                  {a.photoCount > 1 && (
                    <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded">
                      {a.photoCount} photos
                    </span>
                  )}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 leading-tight">{a.name}</p>
                      {a.businessName && <p className="text-xs text-gray-500">{a.businessName}</p>}
                    </div>
                    <ScoreChip score={a.score} />
                  </div>

                  <p className="mt-2 text-sm font-medium text-emerald-800">{a.primaryTrade?.label ?? a.tradeLabels[0]}</p>
                  {a.tradeLabels.length > 1 && (
                    <p className="text-xs text-gray-400">also {a.tradeLabels.slice(1).join(', ')}</p>
                  )}

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                    {a.ratingCount > 0 ? (
                      <>
                        <Stars value={a.ratingAvg} />
                        <span className="tabular-nums">{a.ratingAvg.toFixed(1)}</span>
                        <span className="text-gray-400">({a.ratingCount})</span>
                      </>
                    ) : (
                      <span className="text-gray-400">No ratings yet</span>
                    )}
                    <span className="text-gray-300">·</span>
                    <span>{a.jobsCompleted} jobs done</span>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">{coverageLine(a)}</p>

                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${avail.text}`}>
                      <span className={`w-2 h-2 rounded-full ${avail.dot}`} />
                      {avail.label}
                    </span>
                    <span className="text-sm font-semibold text-emerald-700 group-hover:underline">View profile →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Artisans;
