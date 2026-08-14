import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface RepairJob {
  id: string;
  propertyTitle?: string;
  description: string;
  categoryLabel?: string | null;
  responsibility: 'LANDLORD' | 'TENANT' | 'UNCLEAR';
  status: string;
  createdAt: string;
}

type Mode = 'quote' | 'viewing';

const responsibilityLabel: Record<string, string> = {
  LANDLORD: 'Landlord-funded repair',
  TENANT: 'Tenant-funded repair',
  UNCLEAR: 'Funding to be confirmed',
};

const JobActionForm: React.FC<{ job: RepairJob; mode: Mode; onClose: () => void }> = ({ job, mode, onClose }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    if (mode === 'quote' && !amount) return;
    if (mode === 'viewing' && !date) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'quote') {
        await api.submitQuote(job.id, {
          handymanName: name.trim(),
          handymanPhone: phone.trim(),
          handymanEmail: email.trim() || undefined,
          amount: Number(amount),
          message: message.trim() || undefined,
        });
      } else {
        const scheduledFor = new Date(`${date}T${time}:00`).toISOString();
        await api.bookJobViewing(job.id, {
          handymanName: name.trim(),
          handymanPhone: phone.trim(),
          handymanEmail: email.trim() || undefined,
          scheduledFor,
          message: message.trim() || undefined,
        });
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
            <h3 className="font-semibold text-gray-900 mb-2">{mode === 'quote' ? 'Quote submitted' : 'Site visit requested'}</h3>
            <p className="text-sm text-gray-600 mb-6">
              {mode === 'quote'
                ? "The landlord's team has been notified and will reach out if your quote is accepted."
                : "The landlord's team has been notified and will confirm the visit time with you directly."}
            </p>
            <button onClick={onClose} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 className="font-semibold text-gray-900 mb-1">{mode === 'quote' ? 'Submit a quote' : 'Request a site visit'}</h3>
            <p className="text-sm text-gray-500 mb-4">{job.description}</p>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
            <div className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (WhatsApp)" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              {mode === 'quote' ? (
                <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={1} placeholder="Your quote (₦)" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <input value={date} onChange={(e) => setDate(e.target.value)} type="date" required min={new Date().toISOString().slice(0, 10)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <input value={time} onChange={(e) => setTime(e.target.value)} type="time" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={mode === 'quote' ? 'What does this quote include? (optional)' : 'Anything the landlord should know? (optional)'} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {submitting ? 'Sending…' : mode === 'quote' ? 'Submit quote' : 'Request visit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const Handymen: React.FC = () => {
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ job: RepairJob; mode: Mode } | null>(null);

  useEffect(() => {
    api.getRepairJobs()
      .then((data) => setJobs(data as RepairJob[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load jobs'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
      <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">For artisans</p>
      <h1 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-3">Real repair jobs, no middleman markup</h1>
      <p className="text-gray-600 max-w-2xl mb-10">
        Every job here is a verified landlord's real repair. Quote directly if you're confident from the
        description, or book a site visit first if you need to see it to get the price right — either way, the
        landlord's team is notified the moment you respond.
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <div className="border border-gray-200 rounded-xl p-12 text-center text-gray-500">
          No jobs are open right now — check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {jobs.map((job) => (
            <div key={job.id} className="border border-gray-200 rounded-xl p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
                  {responsibilityLabel[job.responsibility]}
                </span>
                <span className="text-xs text-gray-400">{new Date(job.createdAt).toLocaleDateString('en-GB')}</span>
              </div>
              {job.categoryLabel && <p className="text-xs text-gray-500 mb-1">{job.categoryLabel}</p>}
              <p className="text-sm font-medium text-gray-900 mb-1">{job.description}</p>
              <p className="text-xs text-gray-400 mb-4">{job.propertyTitle}</p>
              <div className="mt-auto flex gap-3">
                <button
                  onClick={() => setActive({ job, mode: 'quote' })}
                  className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  Submit a quote
                </button>
                <button
                  onClick={() => setActive({ job, mode: 'viewing' })}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Book a site visit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {active && <JobActionForm job={active.job} mode={active.mode} onClose={() => setActive(null)} />}
    </div>
  );
};

export default Handymen;
