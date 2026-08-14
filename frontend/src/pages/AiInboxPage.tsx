import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Draft {
  id: string;
  tenancyId: string;
  inReplyToBody: string;
  suggestedBody: string;
  channel: string;
  status: string;
  createdAt: string;
}

const AiInboxPage: React.FC = () => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tenancies, setTenancies] = useState<any[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setError(null);
      const [draftList, tenancyList] = await Promise.all([
        api.getAiDrafts('PENDING_REVIEW'),
        api.getTenancies(),
      ]);
      setDrafts(draftList as Draft[]);
      setTenancies(tenancyList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach the backend');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function tenancyLabel(tenancyId: string) {
    const t = tenancies.find((x) => x.id === tenancyId);
    return t ? `${t.tenantName} · ${t.propertyTitle}` : tenancyId;
  }

  async function handleApprove(draft: Draft) {
    setBusyId(draft.id);
    try {
      const edited = edits[draft.id];
      await api.approveDraft(draft.id, edited && edited !== draft.suggestedBody ? edited : undefined);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(draft: Draft) {
    setBusyId(draft.id);
    try {
      await api.rejectDraft(draft.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject draft');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">AI Inbox</h2>
        <p className="text-sm text-gray-600 mt-1">
          Your AI agent drafts a reply to every tenant message. Nothing reaches a tenant until you approve it — edit
          first if you want to change the wording.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : drafts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 text-center text-sm text-gray-500">
          Nothing waiting on you right now.
        </div>
      ) : (
        <div className="space-y-6">
          {drafts.map((draft) => (
            <div key={draft.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">{tenancyLabel(draft.tenancyId)}</span>
                <span className="text-xs text-gray-400">{new Date(draft.createdAt).toLocaleString('en-GB')}</span>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Tenant said</p>
                <p className="text-sm text-gray-800">{draft.inReplyToBody}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">AI-drafted reply ({draft.channel.toLowerCase()}) — edit if needed</p>
                <textarea
                  value={edits[draft.id] ?? draft.suggestedBody}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [draft.id]: e.target.value }))}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleApprove(draft)}
                  disabled={busyId === draft.id}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  Approve &amp; send
                </button>
                <button
                  onClick={() => handleReject(draft)}
                  disabled={busyId === draft.id}
                  className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AiInboxPage;
