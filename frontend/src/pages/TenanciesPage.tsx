import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CorrespondenceEntry, RentInstallment, RentPaymentPlan, Tenancy } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-gray-100 text-gray-800',
  OVERDUE: 'bg-red-100 text-red-800',
  TERMINATED: 'bg-amber-100 text-amber-900',
};

const channelLabel: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  SMS: 'SMS',
  NOTE: 'Internal note',
};

const TenanciesPage: React.FC = () => {
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reminderStatus, setReminderStatus] = useState<string | null>(null);

  const [plan, setPlan] = useState<RentPaymentPlan>('FULL');
  const [installmentCount, setInstallmentCount] = useState(4);
  const [installments, setInstallments] = useState<RentInstallment[]>([]);
  const [planLoading, setPlanLoading] = useState(false);

  const [thread, setThread] = useState<CorrespondenceEntry[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('Landlord');

  const [agreement, setAgreement] = useState<any>(null);
  const [sendingAgreement, setSendingAgreement] = useState(false);

  useEffect(() => {
    api
      .getTenancies()
      .then((data) => {
        setTenancies(data as Tenancy[]);
        if (data[0]) setSelectedId(data[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to reach the backend'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setReminderStatus(null);
    api.getPaymentPlan(selectedId).then((res) => {
      setPlan((res.plan as RentPaymentPlan) ?? 'FULL');
      setInstallments(res.installments as RentInstallment[]);
    });
    refreshThread(selectedId);
    refreshAgreement(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function refreshThread(tenancyId: string) {
    api.getCorrespondence(tenancyId).then((data) => setThread(data as CorrespondenceEntry[]));
  }

  function refreshAgreement(tenancyId: string) {
    api.getAgreement(tenancyId).then((data) => setAgreement(data));
  }

  async function handleSendAgreement() {
    if (!selected) return;
    setSendingAgreement(true);
    try {
      const res = await api.sendAgreement(selected.id);
      setAgreement(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the tenancy agreement');
    } finally {
      setSendingAgreement(false);
    }
  }

  const selected = tenancies.find((t) => t.id === selectedId);

  async function handleSendReminder() {
    if (!selected) return;
    setReminderStatus('Sending…');
    try {
      const daysOut = Math.max(0, Math.round((new Date(selected.leaseEndDate).getTime() - Date.now()) / 86400000));
      await api.sendRentReminder(selected.id, selected.tenantPhone ?? '2348000000000', daysOut);
      setReminderStatus('Reminder sent over WhatsApp.');
      refreshThread(selected.id);
    } catch (err) {
      setReminderStatus(err instanceof Error ? err.message : 'Failed to send reminder');
    }
  }

  async function handleGeneratePlan() {
    if (!selected) return;
    setPlanLoading(true);
    try {
      const res = await api.setPaymentPlan(selected.id, plan, plan === 'INSTALLMENTS' ? installmentCount : undefined);
      setInstallments(res.installments as RentInstallment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate payment plan');
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !noteBody.trim()) return;
    await api.addCorrespondence(selected.id, {
      channel: 'NOTE',
      direction: 'INTERNAL',
      author: noteAuthor.trim() || 'Landlord',
      body: noteBody.trim(),
    });
    setNoteBody('');
    refreshThread(selected.id);
  }

  if (loading) return <div className="text-sm text-gray-500">Loading tenancies…</div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Tenancies</h2>
        <p className="text-sm text-gray-600 mt-1">Select a tenancy to send a rent reminder, set up its payment plan, or review its correspondence log.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden lg:col-span-1">
          <ul className="divide-y divide-gray-100">
            {tenancies.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-5 py-4 hover:bg-gray-50 transition ${selectedId === t.id ? 'bg-emerald-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-gray-900 text-sm truncate">{t.tenantName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusStyles[t.paymentStatus]}`}>
                      {t.paymentStatus}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{t.propertyTitle}</div>
                  <div className="text-xs text-gray-400 mt-1">Lease ends {new Date(t.leaseEndDate).toLocaleDateString('en-GB')}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected && (
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{selected.tenantName}</h3>
                  <p className="text-sm text-gray-600">{selected.propertyTitle}</p>
                  <p className="text-sm text-gray-500 mt-1">{currencyFormatter.format(selected.rentAmount)} / year · lease ends {new Date(selected.leaseEndDate).toLocaleDateString('en-GB')}</p>
                </div>
                <div className="text-right shrink-0">
                  <button
                    onClick={handleSendReminder}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
                  >
                    Send rent reminder
                  </button>
                  {reminderStatus && <p className="text-xs text-gray-500 mt-2">{reminderStatus}</p>}
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Tenancy agreement</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {!agreement && 'Not sent yet — the tenant signs it themselves from their own portal.'}
                    {agreement?.status === 'SENT' && 'Sent — awaiting the tenant\'s signature.'}
                    {agreement?.status === 'SIGNED' && (
                      <>
                        Signed by <span className="font-medium text-gray-700">{agreement.signedByName}</span> on{' '}
                        {new Date(agreement.signedAt).toLocaleString('en-GB')}
                      </>
                    )}
                  </p>
                </div>
                {agreement?.status === 'SIGNED' ? (
                  <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Signed</span>
                ) : agreement?.status === 'SENT' ? (
                  <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900">Awaiting signature</span>
                ) : (
                  <button
                    onClick={handleSendAgreement}
                    disabled={sendingAgreement}
                    className="shrink-0 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {sendingAgreement ? 'Sending…' : 'Send tenancy agreement'}
                  </button>
                )}
              </div>
              {agreement && (
                <pre className="whitespace-pre-wrap font-sans text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-4 max-h-56 overflow-y-auto">
                  {agreement.content}
                </pre>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Rent payment plan</h3>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Structure</label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as RentPaymentPlan)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="FULL">Pay in full</option>
                    <option value="INSTALLMENTS">Installments</option>
                  </select>
                </div>
                {plan === 'INSTALLMENTS' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1"># of installments</label>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={installmentCount}
                      onChange={(e) => setInstallmentCount(Number(e.target.value))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
                    />
                  </div>
                )}
                <button
                  onClick={handleGeneratePlan}
                  disabled={planLoading}
                  className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
                >
                  {planLoading ? 'Generating…' : 'Generate Paystack payment link(s)'}
                </button>
              </div>

              {installments.length > 0 && (
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase border-b border-gray-100">
                      <tr>
                        <th className="text-left py-2">#</th>
                        <th className="text-left py-2">Amount</th>
                        <th className="text-left py-2">Due</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Paystack link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {installments.map((i) => (
                        <tr key={i.sequence}>
                          <td className="py-2">{i.sequence}</td>
                          <td className="py-2 font-medium">{currencyFormatter.format(i.amount)}</td>
                          <td className="py-2 text-gray-600">{new Date(i.dueDate).toLocaleDateString('en-GB')}</td>
                          <td className="py-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900">{i.status}</span>
                          </td>
                          <td className="py-2">
                            <a href={i.paymentLink} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline text-xs">
                              {i.paystackRequestCode}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Correspondence</h3>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {thread.length === 0 && <p className="text-sm text-gray-500">No correspondence recorded yet.</p>}
                {thread.map((entry) => (
                  <div key={entry.id} className="border border-gray-100 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span className="font-medium text-gray-700">{entry.author} · {channelLabel[entry.channel]}</span>
                      <span>{new Date(entry.createdAt).toLocaleString('en-GB')}</span>
                    </div>
                    <p className="text-sm text-gray-800">{entry.body}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddNote} className="flex flex-col md:flex-row gap-3 pt-2 border-t border-gray-100">
                <input
                  value={noteAuthor}
                  onChange={(e) => setNoteAuthor(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm md:w-40"
                  placeholder="Author"
                />
                <input
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                  placeholder="Log a call, promise, or note about this tenancy…"
                />
                <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
                  Add
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TenanciesPage;
