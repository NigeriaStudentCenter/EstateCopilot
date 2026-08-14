import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { MaintenanceTicket, ResponsibilityChecklist } from '../types';

const statusStyles: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-900',
  DISPATCHED: 'bg-blue-100 text-blue-800',
  AWAITING_TENANT_SIGNOFF: 'bg-purple-100 text-purple-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
};

const responsibilityBadge: Record<string, { text: string; className: string }> = {
  LANDLORD: { text: 'Landlord responsibility', className: 'bg-blue-50 text-blue-800 border border-blue-200' },
  TENANT: { text: 'Tenant responsibility', className: 'bg-amber-50 text-amber-900 border border-amber-200' },
  UNCLEAR: { text: 'Unspecified', className: 'bg-gray-50 text-gray-600 border border-gray-200' },
};

const groupStyles: Record<'LANDLORD' | 'TENANT', { border: string; header: string; check: string }> = {
  LANDLORD: { border: 'border-blue-200', header: 'text-blue-900 bg-blue-50', check: 'accent-blue-600' },
  TENANT: { border: 'border-amber-200', header: 'text-amber-900 bg-amber-50', check: 'accent-amber-600' },
};

const MaintenancePage: React.FC = () => {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [checklist, setChecklist] = useState<ResponsibilityChecklist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refreshTickets() {
    api.getMaintenance().then((data) => setTickets(data as MaintenanceTicket[])).catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load your repair reports'),
    );
  }

  useEffect(() => {
    refreshTickets();
    api.getChecklist().then((data) => setChecklist(data as ResponsibilityChecklist[])).catch(() => {});
  }, []);

  const selectedResponsibility: 'LANDLORD' | 'TENANT' | 'UNCLEAR' | null =
    selectedId === null
      ? null
      : selectedId === 'other'
        ? 'UNCLEAR'
        : (checklist.find((c) => c.sections.some((s) => s.items.some((i) => i.id === selectedId)))?.responsibility ?? 'UNCLEAR');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.reportIssue(description.trim(), selectedId && selectedId !== 'other' ? selectedId : undefined);
      setDescription('');
      setSelectedId(null);
      refreshTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to report the issue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Repairs</h2>
        <p className="text-sm text-gray-600 mt-1">
          Tick what best matches the issue — it tells you (and your landlord) upfront whether it's typically covered
          by the landlord or something tenants usually handle themselves.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {checklist.map((group) => {
            const style = groupStyles[group.responsibility];
            return (
              <div key={group.responsibility} className={`border ${style.border} rounded-lg overflow-hidden`}>
                <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${style.header}`}>
                  {group.responsibility === 'LANDLORD' ? "🏠 Landlord's responsibility" : '🔧 Your responsibility (tenant)'}
                </div>
                <div className="max-h-72 overflow-y-auto p-3 space-y-3">
                  {group.sections.map((section) => (
                    <div key={section.title}>
                      <p className="text-[11px] font-medium text-gray-500 uppercase mb-1">{section.title}</p>
                      <div className="space-y-1.5">
                        {section.items.map((item) => (
                          <label key={item.id} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              className={`mt-0.5 ${style.check}`}
                              checked={selectedId === item.id}
                              onChange={() => setSelectedId(selectedId === item.id ? null : item.id)}
                            />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedId === 'other'}
            onChange={() => setSelectedId(selectedId === 'other' ? null : 'other')}
          />
          Something else / not sure
        </label>

        {selectedResponsibility && (
          <div className={`text-sm rounded-lg px-4 py-2.5 ${responsibilityBadge[selectedResponsibility].className}`}>
            {selectedResponsibility === 'LANDLORD' && '✓ Typically covered by your landlord — they should arrange and pay for this.'}
            {selectedResponsibility === 'TENANT' && '✓ Typically a tenant-maintained item — you can still report it, but it may not be a free repair.'}
            {selectedResponsibility === 'UNCLEAR' && "We'll take a look and confirm who this falls to."}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Describe the issue</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Generator won't start, water pooling near the meter box…"
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Reporting…' : 'Report issue'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {tickets.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">No repairs reported yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tickets.map((t) => (
              <li key={t.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[t.status]}`}>
                    {t.status.replace(/_/g, ' ')}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${responsibilityBadge[t.responsibility ?? 'UNCLEAR'].className}`}>
                    {responsibilityBadge[t.responsibility ?? 'UNCLEAR'].text}
                  </span>
                  {t.tenantSignedOff && <span className="text-xs text-emerald-700 font-medium">✓ You confirmed this is fixed</span>}
                </div>
                {t.categoryLabel && <p className="text-xs text-gray-500 mb-0.5">{t.categoryLabel}</p>}
                <p className="text-sm text-gray-800">{t.description}</p>
                <p className="text-xs text-gray-400 mt-1">Reported {new Date(t.createdAt).toLocaleString('en-GB')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MaintenancePage;
