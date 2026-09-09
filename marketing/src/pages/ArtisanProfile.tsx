import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ScoreChip, Stars, TIER_META } from './Artisans';
import WhatsAppOptIn, { WHATSAPP_OPT_IN_TEXT } from '../components/WhatsAppOptIn';

interface TradeRow {
  id: string;
  label: string;
  group: string | null;
  blurb: string | null;
  yearsExperience: number;
  isPrimary: boolean;
}

interface ArtisanProfileData {
  id: string;
  name: string;
  businessName?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  phone: string;
  primaryTrade?: { id: string; label: string } | null;
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
  memberSince: string;
  trades: TradeRow[];
  workSamples: { id: string; imageUrl: string; caption?: string | null }[];
  verifiedCredentials: string[];
}

const SKILL_LABEL: Record<string, string> = {
  HAND: 'Hand / assistant',
  TRADESMAN: 'Tradesman',
  MASTER: 'Master',
};

const CRED_LABEL: Record<string, string> = {
  NIN: 'National ID (NIN) checked',
  BVN: 'Bank ID (BVN) checked',
  REFERENCE: 'References checked',
  SITE_VISIT: 'Site visit by EstateCopilot',
};

const QuoteModal: React.FC<{ artisan: ArtisanProfileData; onClose: () => void }> = ({ artisan, onClose }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('landlord');
  const [lga, setLga] = useState(artisan.baseLga);
  const [message, setMessage] = useState('');
  const [waOptIn, setWaOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverage = Array.from(new Set([artisan.baseLga, ...artisan.coverageLgas]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || message.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.requestArtisanQuote(artisan.id, {
        name: name.trim(),
        phone: phone.trim(),
        role,
        lga,
        trade: artisan.primaryTrade?.id,
        message: message.trim(),
      });
      if (waOptIn) {
        api
          .captureWhatsAppConsent({
            phone: phone.trim(),
            brand: 'ESTATECOPILOT',
            source: 'artisan_form',
            optInText: WHATSAPP_OPT_IN_TEXT,
            marketingOptIn: true,
          })
          .catch(() => {});
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <h3 className="font-semibold text-gray-900 mb-2">Request sent to {artisan.name}</h3>
            <p className="text-sm text-gray-600 mb-6">
              It's now in their EstateCopilot inbox and our team has been copied. They'll call you on the number
              you gave. You can also call them directly on{' '}
              <a href={`tel:${artisan.phone}`} className="text-emerald-700 font-medium">{artisan.phone}</a>.
            </p>
            <button onClick={onClose} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium">Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 className="font-semibold text-gray-900 mb-1">Request a quote from {artisan.name}</h3>
            <p className="text-sm text-gray-500 mb-4">{artisan.businessName ?? artisan.primaryTrade?.label}</p>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
            <div className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (WhatsApp)" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="landlord">I'm a landlord</option>
                  <option value="tenant">I'm a tenant</option>
                  <option value="other">Other</option>
                </select>
                <select value={lga} onChange={(e) => setLga(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  {coverage.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What do you need done? Rough size, location in the building, when you'd like it…"
                rows={3}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <WhatsAppOptIn checked={waOptIn} onChange={setWaOptIn} />
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {submitting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const ArtisanProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<ArtisanProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setA(null);
    api
      .getArtisan(id)
      .then((d) => setA(d as ArtisanProfileData))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this artisan'));
  }, [id]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="text-gray-600 mb-4">{error}</p>
        <Link to="/artisans" className="text-emerald-700 hover:underline">← Back to all artisans</Link>
      </div>
    );
  }
  if (!a) return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-sm text-gray-500">Loading…</div>;

  const tier = TIER_META[a.verificationTier];
  const coverage = Array.from(new Set([a.baseLga, ...a.coverageLgas]));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <Link to="/artisans" className="text-sm text-emerald-700 hover:underline">← All artisans</Link>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-start gap-5">
        <div className="w-24 h-24 rounded-2xl bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center text-4xl font-serif text-gray-300">
          {a.photoUrl ? <img src={a.photoUrl} alt="" className="w-full h-full object-cover" /> : a.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-gray-900">{a.name}</h1>
            <ScoreChip score={a.score} />
          </div>
          {a.businessName && <p className="text-gray-600">{a.businessName}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {tier && <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${tier.className}`}>{tier.label}</span>}
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{SKILL_LABEL[a.skillLevel]}</span>
            {a.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-gray-600">
                <Stars value={a.ratingAvg} /> {a.ratingAvg.toFixed(1)} <span className="text-gray-400">({a.ratingCount})</span>
              </span>
            ) : (
              <span className="text-gray-400 text-xs">No ratings yet</span>
            )}
            <span className="text-gray-300">·</span>
            <span className="text-gray-600">{a.jobsCompleted} jobs done</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={`tel:${a.phone}`}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700"
        >
          📞 Call {a.phone}
        </a>
        <button
          onClick={() => setQuoteOpen(true)}
          className="inline-flex items-center gap-2 border border-emerald-600 text-emerald-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-50"
        >
          Request a quote
        </button>
      </div>

      {a.bio && <p className="mt-6 text-gray-700 max-w-2xl">{a.bio}</p>}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Trades</h2>
          <ul className="space-y-3">
            {a.trades.map((t) => (
              <li key={t.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{t.label}</span>
                  {t.isPrimary && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Primary</span>}
                </div>
                {t.blurb && <p className="text-xs text-gray-500">{t.blurb}</p>}
                <p className="text-xs text-gray-400">{t.yearsExperience} yr{t.yearsExperience === 1 ? '' : 's'} experience</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Coverage &amp; checks</h2>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Works in</p>
          <p className="text-sm text-gray-800 mb-4">{coverage.join(' · ')} <span className="text-gray-400">({a.baseState})</span></p>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Verified</p>
          {a.verifiedCredentials.length > 0 ? (
            <ul className="space-y-1">
              {a.verifiedCredentials.map((c) => (
                <li key={c} className="text-sm text-gray-800 flex items-center gap-2">
                  <span className="text-emerald-600">✓</span> {CRED_LABEL[c] ?? c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">ID check on file.</p>
          )}
          <p className="text-xs text-gray-400 mt-4">On EstateCopilot since {new Date(a.memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
        </section>
      </div>

      {a.workSamples.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold text-gray-900 mb-3">Recent work</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {a.workSamples.map((w) => (
              <button
                key={w.id}
                onClick={() => setLightbox(w.imageUrl)}
                className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90"
              >
                <img src={w.imageUrl} alt={w.caption ?? ''} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 rounded-xl bg-emerald-50 border border-emerald-100 p-5 text-sm text-emerald-900">
        <b>How this works:</b> Requesting a quote sends your job straight to {a.name.split(',')[0]}'s EstateCopilot
        inbox and copies our team. There's no fee to ask. If you hire them, agree the price and payment directly —
        EstateCopilot doesn't sit in the middle of a direct hire.
      </div>

      {quoteOpen && <QuoteModal artisan={a} onClose={() => setQuoteOpen(false)} />}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
};

export default ArtisanProfile;
