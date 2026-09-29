import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { LANDLORD_PORTAL_URL } from '../lib/links';

// Student Housing Hub — EstateCopilot's guide to safe student accommodation
// in Nigeria, for students, parents/sponsors and landlords. Adapted from the
// compliance-hub model used in UK student lettings (deposit protection,
// check-in/check-out reports, guarantors, safety, verified reviews) to how
// students actually rent here: per-session hostels, caution fees, parents
// paying, and agents asking for "inspection fees".

const SECTIONS = [
  ['protect', 'How we protect you'],
  ['before', 'Before you pay'],
  ['safety', 'Safety standards'],
  ['caution', 'Your caution fee'],
  ['parents', 'Parents & sponsors'],
  ['landlords', 'Landlords & hostel owners'],
  ['ambassadors', 'Student Ambassadors'],
  ['faq', 'FAQ'],
] as const;

const H2: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <h2 id={id} className="font-serif text-2xl font-bold text-gray-900 scroll-mt-24 mb-3">{children}</h2>
);

const BEFORE_YOU_PAY = [
  ['Never pay an “inspection fee” or “form fee” to someone you can’t verify.', 'The most common student housing scam. On EstateCopilot you don’t pay anyone to view, and you only pay through EstateCopilot’s Paystack link — never into a personal account.'],
  ['See the actual room — or a live video call.', 'Old or borrowed photos are common. Ask the host for a WhatsApp video call walking through the room, bathroom and compound.'],
  ['Walk the route to campus, ideally in the evening.', 'Is it lit? Is there a safe place to wait for a bike or bus? Distance on a map isn’t the whole story.'],
  ['Check water and power honestly.', 'Where does water come from, how often is there light, and who pays for fuel or the prepaid meter?'],
  ['Ask who else lives there.', 'Single-sex or mixed, how many students share a toilet and kitchen, is there a caretaker on site?'],
  ['Read the house rules before you agree to them.', 'Visitors, quiet hours, cooking, curfew — make sure you can live with them.'],
  ['Know exactly what you’re paying for.', 'Rent, caution fee, service charge, utilities. On EstateCopilot the total is shown before you pay, and the caution fee is shown separately.'],
  ['Take move-in photos the day you arrive.', 'Every wall, the floor, the bed, doors, windows and bathroom — add them to your booking page. They protect your caution fee.'],
  ['Keep everything in writing.', 'Your booking page keeps your payment, house rules, reports and every problem you report in one place.'],
  ['Trust your instincts.', 'If a place or person feels wrong, don’t pay. Tell us — we’d rather check a listing than have a student hurt.'],
];

const FAIR_WEAR = [
  ['Fair wear and tear (not deductible)', ['Faded paint or light scuffs from normal living', 'Worn carpet or mattress from normal use', 'Loose hinges or handles that wear out over time', 'Small nail holes from hanging a calendar or mirror']],
  ['Damage (can be deducted, with evidence)', ['Broken doors, windows, burglary proof or furniture', 'Burns, large stains or holes in walls', 'Missing keys or furniture', 'Deep cleaning needed beyond normal use']],
] as const;

const FAQ = [
  ['Do I need an account?', 'No. After you book you get a private link by email. It’s your booking page for the whole stay. Keep it private.'],
  ['Why do you ask for my BVN or NIN?', 'So hosts know exactly who is staying, and so students know every host deals with real, identifiable people. We only keep the ID type, the last 4 digits and the name the registry returns — never the full number — and the host never sees it.'],
  ['Why do students need to upload a student ID?', 'Student places are reserved for students. The host checks your card before approving; only the host can see it.'],
  ['Can my parent or sponsor pay?', 'Yes. Choose “My parent / sponsor” when you book and the payment link goes to them. They also get updates as your booking progresses and are your emergency contact.'],
  ['What if the host never returns my caution fee?', 'They can’t hold it — EstateCopilot does. The host can only propose deductions, with a reason and move-out photos. You can accept or dispute; disputes are decided by EstateCopilot.'],
  ['What is the session price?', 'Many hostels are let per academic session. If a listing has a session price and you book 150 nights or more, you pay the session price if it’s cheaper than the monthly price.'],
  ['Something is wrong in my room. What do I do?', 'Use “Report a problem” on your booking page. Your host is notified immediately by the app and email. For emergencies call 112.'],
];

const StudentHub: React.FC = () => {
  const [safety, setSafety] = useState<{ key: string; label: string; essential: boolean }[]>([]);
  useEffect(() => {
    api.getStudentSafety().then(setSafety).catch(() => {});
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-br from-emerald-900 to-emerald-700 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-200 mb-2">Student Housing Hub</p>
          <h1 className="font-serif text-3xl md:text-5xl font-bold max-w-3xl">Safe, verified places to live while you study</h1>
          <p className="text-emerald-50/90 mt-4 max-w-2xl">
            Guides and protections for students, parents and landlords across Nigeria — from spotting a fake agent to getting your caution fee back.
            Built with the EstateCopilot Student Ambassador programme.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to="/stays?student=1" className="bg-white text-emerald-900 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-50">Find student housing</Link>
            <a href="#landlords" className="border border-white/40 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/10">I’m a landlord</a>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-[200px_1fr] gap-10">
        <nav className="hidden lg:block">
          <ul className="sticky top-24 space-y-1.5 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}><a href={`#${id}`} className="text-gray-600 hover:text-emerald-700">{label}</a></li>
            ))}
          </ul>
        </nav>

        <div className="space-y-14 min-w-0">
          <section>
            <H2 id="protect">How EstateCopilot protects students</H2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ['🪪 Verified people', 'Every guest gives a BVN or NIN for an identity check, and every student shows a student ID to the host. Hosts are registered landlords on EstateCopilot.'],
                ['🔒 Caution fee held by us', 'Your caution fee is paid to EstateCopilot, not the landlord. It comes back after you move out, less only deductions backed by photos — which you can dispute.'],
                ['🛡️ Safety standards', 'Hosts declare 14 safety checks. Student Ambassadors visit and inspect; inspected places carry a badge.'],
                ['📸 Move-in & move-out reports', 'Both you and the host can record the room’s condition with photos. The other side confirms or disagrees — it’s the evidence if there’s ever a dispute.'],
                ['👪 Parents in the loop', 'Add a parent, guardian or sponsor. They can pay directly and are kept updated as your booking progresses.'],
                ['⭐ Real reviews', 'Only students who actually stayed can leave a review — rated on safety, host, value and accuracy.'],
              ].map(([t, b]) => (
                <div key={t} className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="font-semibold text-gray-900">{t}</p>
                  <p className="text-sm text-gray-600 mt-1">{b}</p>
                </div>
              ))}
            </div>
            <ol className="mt-6 grid sm:grid-cols-5 gap-3 text-sm">
              {['Choose a student place', 'Verify your ID & upload your student card', 'Host approves', 'You or your sponsor pays', 'Move in & add photos'].map((s, i) => (
                <li key={s} className="bg-emerald-50 rounded-lg p-3"><span className="text-emerald-700 font-bold">{i + 1}.</span> {s}</li>
              ))}
            </ol>
          </section>

          <section>
            <H2 id="before">Before you pay: 10 checks</H2>
            <ol className="space-y-3">
              {BEFORE_YOU_PAY.map(([t, b], i) => (
                <li key={t} className="flex gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 text-sm font-bold flex items-center justify-center">{i + 1}</span>
                  <div><p className="font-medium text-gray-900">{t}</p><p className="text-sm text-gray-600">{b}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <H2 id="safety">Student housing safety standards</H2>
            <p className="text-sm text-gray-600 mb-4">
              What every student-friendly place on EstateCopilot is measured against. Essentials (★) must all be in place before a Student Ambassador can mark a
              place as inspected. Each listing shows a safety score out of 100.
            </p>
            <ul className="grid sm:grid-cols-2 gap-2">
              {safety.map((f) => (
                <li key={f.key} className={`text-sm rounded-lg px-3 py-2 border ${f.essential ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-gray-200 bg-white text-gray-700'}`}>
                  {f.essential ? '★ ' : ''}{f.label}
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-600 mt-4">
              Worried about a place — no fire extinguisher, exposed wiring, a generator by the windows, an unsafe route? Tell us at{' '}
              <a href="mailto:john@bsoedu.org?subject=Unsafe%20student%20housing" className="text-emerald-700 underline">john@bsoedu.org</a>. Reports are confidential.
            </p>
          </section>

          <section>
            <H2 id="caution">Your caution fee, protected</H2>
            <p className="text-sm text-gray-600 mb-4">
              Caution fees that are never returned are one of students’ biggest complaints. On EstateCopilot the landlord never holds it:
            </p>
            <ol className="grid sm:grid-cols-4 gap-3 text-sm">
              {[
                ['Held', 'You pay the caution fee with your booking. EstateCopilot holds it.'],
                ['Proposed', 'After you move out, the host proposes the return. Any deduction needs a reason and move-out photos.'],
                ['Accept or dispute', 'You have 7 days. Accept, or dispute and EstateCopilot reviews both sides’ photos and decides.'],
                ['Returned', 'We send your money back and record it on your booking page.'],
              ].map(([t, b], i) => (
                <li key={t} className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="font-semibold text-gray-900">{i + 1}. {t}</p>
                  <p className="text-gray-600 mt-1">{b}</p>
                </li>
              ))}
            </ol>
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              {FAIR_WEAR.map(([title, items]) => (
                <div key={title} className="border border-gray-200 rounded-xl p-4 bg-white">
                  <p className="font-semibold text-gray-900 mb-2">{title}</p>
                  <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">{items.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <H2 id="parents">For parents, guardians and sponsors</H2>
            <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
              <li><strong>Pay directly.</strong> When your student books, they can choose you as the payer — the payment link comes straight to you, not through a middleman.</li>
              <li><strong>Know who they’re living with.</strong> Hosts deal only with ID-checked guests, and student-only places require a student ID.</li>
              <li><strong>Stay informed.</strong> You’re told when the booking is approved and confirmed, and when the caution fee is settled.</li>
              <li><strong>You’re the emergency contact.</strong> Your number is on the booking for the host to reach you if something happens.</li>
              <li><strong>Get the caution fee back.</strong> It’s held by EstateCopilot, and deductions need photo evidence.</li>
            </ul>
          </section>

          <section>
            <H2 id="landlords">For landlords and hostel owners</H2>
            <p className="text-sm text-gray-600 mb-4">Students are reliable tenants when expectations are clear on both sides. Listing student housing on EstateCopilot:</p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="font-semibold text-gray-900 mb-2">Your student-housing checklist</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-700">
                  <li>Mark the place for <em>Students</em> (or Both) and set male-only / female-only if it applies</li>
                  <li>Set a session price, and the caution fee</li>
                  <li>Declare every safety feature honestly — then request an ambassador inspection</li>
                  <li>Write clear house rules (visitors, quiet hours, cooking, utilities)</li>
                  <li>Check each student ID before approving</li>
                  <li>File a move-in report with photos on day one, and a move-out report at the end</li>
                  <li>Fix reported problems quickly and mark them fixed</li>
                </ul>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="font-semibold text-gray-900 mb-2">What you get</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-700">
                  <li>ID-checked students, with a parent or sponsor on every booking</li>
                  <li>Payment up front through Paystack — no chasing</li>
                  <li>A fair, evidence-based process for deductions from the caution fee</li>
                  <li>The “Ambassador-inspected” badge and verified reviews that win bookings</li>
                  <li>Everything in the EstateCopilot portal and app</li>
                </ul>
                <a href={LANDLORD_PORTAL_URL} className="inline-block mt-3 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700">List your student housing</a>
              </div>
            </div>
          </section>

          <section>
            <H2 id="ambassadors">The Student Ambassador programme</H2>
            <p className="text-sm text-gray-700">
              Student Ambassadors are students who visit student-friendly places near their campus and check them against the safety standards above.
              A place that passes shows <span className="text-xs font-medium text-white bg-emerald-600 rounded-full px-2 py-0.5">✓ Ambassador-inspected</span>. If a host later
              drops an essential safety feature, the badge is removed automatically.
            </p>
            <p className="text-sm text-gray-700 mt-3">
              Want to become an ambassador at your school, or have a place inspected?{' '}
              <a href="mailto:john@bsoedu.org?subject=Student%20Ambassador" className="text-emerald-700 underline">Get in touch</a>.
            </p>
          </section>

          <section>
            <H2 id="faq">Frequently asked questions</H2>
            <div className="space-y-2">
              {FAQ.map(([q, a]) => (
                <details key={q} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                  <summary className="font-medium text-gray-900 cursor-pointer">{q}</summary>
                  <p className="text-sm text-gray-600 mt-2">{a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
            <p className="font-semibold text-emerald-900">Ready to find a place?</p>
            <Link to="/stays?student=1" className="inline-block mt-3 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700">Browse student housing</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentHub;
