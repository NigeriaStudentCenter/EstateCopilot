import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import VideoEmbed from '../components/VideoEmbed';
import StateSelect from '../components/StateSelect';
import { TENANT_PORTAL_URL } from '../lib/links';
import dashboardScreenshot from '../assets/landlord-dashboard-screenshot.jpg';

const problems = [
  {
    problem: 'A tenant stops paying rent, and you don’t notice for months.',
    why: 'By the time you check, they owe three months — and the guarantor they gave you turns out to not even be a real person.',
    fix: 'Before anyone moves in, we check their government ID and confirm their guarantor is a real person who agrees to help. You know who you’re renting to before there’s a problem — not after.',
  },
  {
    problem: 'You pay an agent, but you’re never sure what they actually did.',
    why: 'You call, they say they’re "handling it," and three days later you still don’t know if the rent came in.',
    fix: 'Everything happens on one screen you can check any time — when rent is paid, what was said, what got fixed. No more calling to ask.',
  },
  {
    problem: 'Something breaks, and now fixing it is a whole stressful process.',
    why: 'A pipe leaks, a light stops working, a gate won’t lock — and you have to find someone, hope they’re honest, and hope the price is fair.',
    fix: 'Your tenant tells us what broke. Real repair workers see the job and offer their price. You just pick the one you like — no calling around, no guessing.',
  },
  {
    problem: 'You and your tenant argue about who said what.',
    why: '"I told the agent about that crack months ago." Did they? There’s no way to check — nothing was ever written down.',
    fix: 'Every message between you and your tenant is saved, with the date and time, forever. If there’s ever an argument, you just scroll up and look.',
  },
];

const features = [
  {
    icon: '🪪',
    bg: 'bg-blue-50',
    title: 'Checking tenants',
    body: 'Like a security guard checking ID at the door. Before anyone signs a lease, we make sure they really are who they say they are — and that their guarantor is real too.',
  },
  {
    icon: '💵',
    bg: 'bg-emerald-50',
    title: 'Getting paid',
    body: 'Rent goes straight into your own bank account — like a direct deposit, instead of someone hand-carrying your cash to you eventually.',
  },
  {
    icon: '🔧',
    bg: 'bg-amber-50',
    title: 'Fixing things',
    body: 'Works like ordering delivery. You say what’s broken, real repair workers offer their price, you pick the one you want. They do the job, you pay them directly.',
  },
  {
    icon: '💬',
    bg: 'bg-purple-50',
    title: 'Saving every message',
    body: 'Like a text conversation that can never be deleted. Nobody can say "I never said that" — you can always scroll up and check.',
  },
];

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [browseState, setBrowseState] = useState('');

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-emerald-50/40 to-transparent">
        <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-32 w-80 h-80 rounded-full bg-amber-200/30 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12 md:pt-24">
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-4">Built for Nigerian landlords</p>
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-gray-900 leading-tight max-w-3xl text-balance">
            One flat fee. Not a cut of your rent, not a surprise repair markup.
          </h1>
          <p className="text-lg text-gray-600 mt-6 max-w-2xl">
            {currencyFormatter.format(10000)}/month, full stop — tenant checks, rent collection, repairs, and every
            message saved, running for every property you list. Compare that to a typical agent's 10% of annual
            rent, taken as a lump sum whenever they feel like collecting it.
          </p>
          <div className="flex flex-wrap gap-4 mt-8">
            <Link to="/signup" className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold shadow-sm hover:bg-emerald-700 hover:shadow transition">
              List your property — {currencyFormatter.format(10000)}/mo
            </Link>
            <a href="#video" className="bg-white border border-gray-200 text-gray-800 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition">
              Watch a repair get fixed →
            </a>
          </div>
        </div>

        {/* Plain-English summary */}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-16 md:pb-20">
          <div className="bg-white border border-emerald-100 shadow-sm shadow-emerald-100/50 rounded-2xl p-6 md:p-8 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">🌱 In plain words</p>
            <p className="text-lg text-gray-800 leading-relaxed">
              You own a house you rent out. We check that renters are honest before they move in, collect the rent
              for you, get things fixed when they break, and save every message so nothing gets forgotten. You pay
              one small amount every month. That's it.
            </p>
          </div>
        </div>
      </section>

      {/* Browse by state */}
      <section className="border-y border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row md:items-center gap-5">
          <div className="shrink-0">
            <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-1">Nationwide, state by state</p>
            <p className="text-gray-900 font-medium">Every state has its own listings and its own artisans.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <StateSelect value={browseState} onChange={setBrowseState} countKey="propertyCount" />
            <button
              onClick={() => navigate(browseState ? `/properties/${browseState}` : '/properties')}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700"
            >
              Browse properties
            </button>
            <button
              onClick={() => navigate(browseState ? `/handymen/${browseState}` : '/handymen')}
              className="bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50"
            >
              Browse artisans
            </button>
          </div>
        </div>
      </section>

      {/* Video */}
      <section id="video" className="max-w-4xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2 text-center">60 seconds</p>
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-gray-900 text-center mb-8 text-balance">
          From "my tap is leaking" to a paid artisan — no phone calls
        </h2>
        <VideoEmbed src={import.meta.env.VITE_WALKTHROUGH_VIDEO_URL} />
        <p className="text-sm text-gray-500 text-center mt-4">
          This is the exact flow that runs behind every repair reported on your properties.
        </p>
      </section>

      {/* Problems + fixes, paired */}
      <section className="bg-[#f6f2e9] border-y border-amber-100/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">The problems every landlord knows</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 max-w-2xl mb-4 text-balance">
            Four things that happen to almost every landlord — and exactly how we stop them
          </h2>
          <p className="text-gray-600 max-w-2xl mb-12">
            If you've rented out a property in Nigeria, you've probably lived through at least one of these.
          </p>
          <div className="space-y-6">
            {problems.map((p, i) => (
              <div key={p.problem} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6 md:p-8 grid grid-cols-1 md:grid-cols-[auto_1fr_1fr] gap-4 md:gap-8 items-start">
                <div className="hidden md:flex w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-semibold items-center justify-center shrink-0">
                  {i + 1}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">The problem</p>
                  <h3 className="font-semibold text-gray-900 mb-1.5">{p.problem}</h3>
                  <p className="text-sm text-gray-500">{p.why}</p>
                </div>
                <div className="md:border-l md:border-gray-100 md:pl-8">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1.5">How we fix it</p>
                  <p className="text-sm text-emerald-900">{p.fix}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features, explained simply */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">What's actually included</p>
        <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 max-w-2xl mb-4 text-balance">
          Four things, explained the simple way
        </h2>
        <p className="text-gray-600 max-w-2xl mb-12">
          No jargon — here's what each part of EstateCopilot actually does, in everyday terms.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6 hover:shadow-md hover:-translate-y-0.5 transition">
              <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center text-2xl mb-4`}>{f.icon}</div>
              <h3 className="font-semibold text-lg text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* See it before you believe it */}
      <section className="bg-[#f6f2e9] border-y border-amber-100/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">See it before you believe it</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 max-w-2xl mb-4 text-balance">
            This is the actual dashboard you'll get — not a mockup
          </h2>
          <p className="text-gray-600 max-w-2xl mb-10">
            No stock photos, no "coming soon." This is a real screenshot of the landlord portal — your properties,
            your tenants, your rent, your repairs, all in one place from the day you sign up.
          </p>
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-2 md:p-3">
            <img
              src={dashboardScreenshot}
              alt="EstateCopilot landlord dashboard showing portfolio revenue, active tenancies, pending repairs, and tenant compliance status"
              className="w-full h-auto rounded-xl border border-gray-100"
            />
          </div>
        </div>
      </section>

      {/* Rent goes directly to the landlord */}
      <section className="bg-emerald-50/60 border-y border-emerald-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">Where your rent actually goes</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 max-w-2xl mb-4 text-balance">
            Paystack is connected to YOUR bank account — not ours
          </h2>
          <p className="text-gray-600 max-w-2xl mb-12">
            When a tenant pays rent, it goes straight into your own bank account through Paystack — the same
            trusted payment company Nigerian banks and businesses already use. We never hold your money, never see
            your balance, and can't touch it. All we do is watch for the receipt, the same way a delivery app tells
            you "your food has arrived" — so we can update your dashboard and remind you if a payment is late.
          </p>

          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6 md:p-10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col items-center text-center w-full md:w-40">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-3xl mb-3">🧑</div>
                <p className="font-semibold text-gray-900 text-sm">Your tenant</p>
                <p className="text-xs text-gray-500">pays rent</p>
              </div>

              <div className="text-emerald-400 text-2xl rotate-90 md:rotate-0">→</div>

              <div className="flex flex-col items-center text-center w-full md:w-40">
                <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-3xl mb-3">🏦</div>
                <p className="font-semibold text-gray-900 text-sm">Paystack</p>
                <p className="text-xs text-gray-500">just moves the money</p>
              </div>

              <div className="text-emerald-400 text-2xl rotate-90 md:rotate-0">→</div>

              <div className="flex flex-col items-center text-center w-full md:w-40">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-3xl mb-3">🏠</div>
                <p className="font-semibold text-gray-900 text-sm">Your bank account</p>
                <p className="text-xs text-emerald-700 font-medium">100% arrives here</p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 flex items-start gap-3">
              <span className="text-lg shrink-0">👀</span>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">EstateCopilot only watches.</span> We're not in the
                money's path at any point — we just get notified once it lands, so your dashboard stays up to date.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing psychology */}
      <section className="bg-emerald-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <p className="text-sm font-semibold text-emerald-400 uppercase tracking-wide mb-2">How much this costs — and why that's the whole point</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold max-w-2xl mb-6 text-balance">
            {currencyFormatter.format(10000)} a month. Every property, everything included, no line-item surprises.
          </h2>
          <p className="text-emerald-100 max-w-2xl mb-10">
            An agent's 10% is a moving target — you don't know the number until they hand you an invoice, and it
            comes out of your rent whether or not anything actually happened that month. This is the opposite: one
            fixed amount, charged the same day every month, covering tenant checks, rent collection, the repair
            marketplace, and every saved message — whether you have one property or ten. You will always know this
            month's bill before the month starts.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <p className="text-2xl font-bold font-serif mb-1">{currencyFormatter.format(10000)}/month flat</p>
              <p className="text-sm text-emerald-200">One line on your bank statement. No per-transaction cuts, no hidden add-ons.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <p className="text-2xl font-bold font-serif mb-1">0% of your rent or repairs</p>
              <p className="text-sm text-emerald-200">Rent settles straight into your account. Accept a repair quote, and the full amount goes to the artisan.</p>
            </div>
          </div>
          <p className="text-emerald-300 text-sm font-medium">
            Cancel anytime from your dashboard — no lock-in, no exit fee.
          </p>
        </div>
      </section>

      {/* GDP / pride */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">Where the money actually goes</p>
        <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 max-w-2xl mb-6 text-balance">
          Every repair you approve pays a real Nigerian artisan — in full, no middleman
        </h2>
        <p className="text-gray-600 max-w-2xl mb-10">
          When you list a repair, it goes to an open marketplace where electricians, plumbers, and tilers across
          Lagos, Abuja, and Port Harcourt bid for the job directly. Accept a quote and the full amount goes to that
          artisan — the platform doesn't skim it. Multiply that across every landlord using the marketplace, and this
          is thousands of Nigerians earning verifiable income, and thousands of small jobs finally counting toward
          the economy instead of staying invisible in a cash transaction nobody tracked. You're not just fixing your
          building — you're one of the people actually building the market for skilled work in this country. That's
          worth being proud of.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
            <p className="font-semibold text-gray-900 mb-1">Every listed repair</p>
            <p className="text-sm text-gray-600">is one verified job opportunity for a vetted Nigerian artisan, not an invisible cash job.</p>
          </div>
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
            <p className="font-semibold text-gray-900 mb-1">Every advertised property</p>
            <p className="text-sm text-gray-600">is one less unit sitting vacant while a tenant somewhere is still searching.</p>
          </div>
        </div>
      </section>

      {/* Legal help, new add-on */}
      <section className="bg-emerald-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <p className="text-sm font-semibold text-emerald-400 uppercase tracking-wide mb-2">New — a lawyer, whenever you actually need one</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold max-w-2xl mb-6 text-balance">
            You used to need your own retained lawyer. Now the platform provides one, on demand.
          </h2>
          <p className="text-emerald-100 max-w-2xl mb-10">
            Every landlord in Nigeria eventually needs a lawyer — a tenant stops paying, a lease needs to hold up on
            paper, someone won't leave when they're supposed to. Before now, that meant keeping your own solicitor on
            retainer, whether you needed them that month or not. EstateCopilot now puts a vetted legal team directly
            inside your dashboard: log what you need, and it's opened to verified Nigerian lawyers who send you a
            proposal — you only ever engage one, and only when you actually have a case.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="text-2xl mb-3">📄</div>
              <p className="font-semibold mb-1.5">Notice to quit, done right</p>
              <p className="text-sm text-emerald-200">
                Under the Lagos Tenancy Law, a wrongly-served notice — wrong length, wrong wording, wrong person
                signing it — can invalidate the entire eviction, sending you back to day one. A lawyer drafts and
                signs it correctly the first time.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="text-2xl mb-3">✍️</div>
              <p className="font-semibold mb-1.5">Tenancy agreements that hold up</p>
              <p className="text-sm text-emerald-200">
                Get your lease reviewed or drafted by someone who knows what a Nigerian court will actually enforce —
                not a template copied from a friend's old agreement.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="text-2xl mb-3">⚖️</div>
              <p className="font-semibold mb-1.5">Rent recovery &amp; disputes</p>
              <p className="text-sm text-emerald-200">
                A tenant owing months of rent, or disputing a deposit, is exactly the kind of case worth an NBA-licensed
                lawyer — engaged directly through the platform, no personal contact needed.
              </p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <p className="text-sm text-emerald-200 max-w-lg">
              <span className="font-semibold text-white">No retainer, no platform fee.</span> You log the request,
              lawyers propose their fee directly to you, and you pick who to engage — the same way repairs work with
              artisans. It's part of your subscription; the only thing you ever pay for is the actual legal work you
              choose to accept.
            </p>
            <Link
              to="/legal-team"
              className="shrink-0 bg-emerald-400 text-emerald-950 px-6 py-3 rounded-xl font-semibold hover:bg-emerald-300 transition whitespace-nowrap"
            >
              See how it works →
            </Link>
          </div>
        </div>
      </section>

      {/* Tenant cross-link */}
      <section className="bg-[#f6f2e9] border-y border-amber-100/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">Built for your tenants too</p>
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">Tenants get their own portal, so they stop calling you</h2>
            <p className="text-gray-600 max-w-xl">
              They message you directly, report repairs with a checklist that tells them upfront whether it's on you
              or on them, and track exactly when rent is due — all logged, all in one place.
            </p>
          </div>
          <a href={TENANT_PORTAL_URL} className="shrink-0 bg-white border border-gray-200 shadow-sm text-gray-800 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition whitespace-nowrap">
            Open tenant portal →
          </a>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-balance">
          Ready to see it running on your own property?
        </h2>
        <p className="text-gray-600 mb-8 max-w-xl mx-auto">
          {currencyFormatter.format(10000)}/month, billed the same day every month. Cancel anytime from your dashboard.
        </p>
        <Link to="/signup" className="inline-block bg-emerald-600 text-white px-8 py-3.5 rounded-xl font-semibold shadow-sm hover:bg-emerald-700 hover:shadow transition">
          List your property — {currencyFormatter.format(10000)}/mo
        </Link>
        <p className="text-sm text-gray-400 mt-6">
          Have a vacant unit right now? <Link to="/properties" className="text-emerald-700 hover:underline">See how listings look</Link> ·
          {' '}Repair-ready and looking for work? <Link to="/handymen" className="text-emerald-700 hover:underline">Browse open jobs</Link> ·
          {' '}Practicing law in Nigeria? <Link to="/legal-team" className="text-emerald-700 hover:underline">See open requests</Link>
        </p>
      </section>
    </>
  );
};

export default Home;
