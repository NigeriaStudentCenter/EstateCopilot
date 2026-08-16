import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface LegalRequest {
  id: string;
  propertyTitle?: string;
  category: string;
  description: string;
  status: string;
  createdAt: string;
}

const ProposalForm: React.FC<{ request: LegalRequest; onClose: () => void }> = ({ request, onClose }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lawFirm, setLawFirm] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !amount) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitLegalQuote(request.id, {
        lawyerName: name.trim(),
        lawyerPhone: phone.trim(),
        lawyerEmail: email.trim() || undefined,
        lawFirm: lawFirm.trim() || undefined,
        amount: Number(amount),
        message: message.trim() || undefined,
      });
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
            <h3 className="font-semibold text-gray-900 mb-2">Proposal sent</h3>
            <p className="text-sm text-gray-600 mb-6">The landlord has been notified and will reach out directly if your proposal is accepted.</p>
            <button onClick={onClose} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 className="font-semibold text-gray-900 mb-1">Submit a proposal</h3>
            <p className="text-sm text-gray-500 mb-4">{request.category} — {request.description}</p>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
            <div className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (WhatsApp)" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={lawFirm} onChange={(e) => setLawFirm(e.target.value)} placeholder="Law firm (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={1} placeholder="Your fee (₦)" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What does this cover? (optional)" rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {submitting ? 'Sending…' : 'Submit proposal'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const LegalTeam: React.FC = () => {
  const [requests, setRequests] = useState<LegalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<LegalRequest | null>(null);

  useEffect(() => {
    api.getLegalRequests()
      .then((data) => setRequests(data as LegalRequest[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load requests'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
      <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">For lawyers</p>
      <h1 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-3">Real landlord legal work, direct to you</h1>
      <p className="text-gray-600 max-w-2xl mb-10">
        Every request here comes from a verified landlord on EstateCopilot — notice to quit, tenancy agreement
        review, rent recovery, disputes. Send a proposal directly; the landlord is notified the moment you respond
        and picks who to engage.
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading requests…</p>
      ) : requests.length === 0 ? (
        <div className="border border-gray-200 rounded-xl p-12 text-center text-gray-500">
          No open requests right now — check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {requests.map((r) => (
            <div key={r.id} className="border border-gray-200 rounded-xl p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
                  {r.category}
                </span>
                <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString('en-GB')}</span>
              </div>
              <p className="text-sm font-medium text-gray-900 mb-1">{r.description}</p>
              <p className="text-xs text-gray-400 mb-4">{r.propertyTitle}</p>
              <button
                onClick={() => setActive(r)}
                className="mt-auto bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
              >
                Submit a proposal
              </button>
            </div>
          ))}
        </div>
      )}

      {active && <ProposalForm request={active} onClose={() => setActive(null)} />}
    </div>
  );
};

export default LegalTeam;
