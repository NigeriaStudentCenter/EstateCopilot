import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CorrespondenceEntry } from '../types';

const channelLabel: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  SMS: 'SMS',
  PORTAL: 'Portal message',
};

const CorrespondencePage: React.FC = () => {
  const [thread, setThread] = useState<CorrespondenceEntry[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getCorrespondence().then((data) => setThread(data as CorrespondenceEntry[])).catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load messages'),
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.sendMessage(body.trim());
      setBody('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Messages</h2>
        <p className="text-sm text-gray-600 mt-1">
          Talk directly to your landlord. Replies are reviewed before they're sent, so it may take a little while.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
        <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {thread.length === 0 && <p className="text-sm text-gray-500">No messages yet — say hello below.</p>}
          {thread.map((entry) => (
            <div
              key={entry.id}
              className={`max-w-[85%] rounded-xl px-4 py-3 ${
                entry.direction === 'OUTBOUND' ? 'bg-emerald-50 border border-emerald-100 ml-auto' : 'bg-gray-50 border border-gray-100'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1 gap-4">
                <span className="font-medium text-gray-700">{entry.author} · {channelLabel[entry.channel]}</span>
                <span>{new Date(entry.createdAt).toLocaleString('en-GB')}</span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-line">{entry.body}</p>
            </div>
          ))}
        </div>
        <form onSubmit={handleSend} className="flex gap-3 pt-3 border-t border-gray-100">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message to your landlord…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={sending}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default CorrespondencePage;
