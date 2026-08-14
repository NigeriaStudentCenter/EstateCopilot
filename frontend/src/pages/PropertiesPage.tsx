import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Property } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

const PropertiesPage: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newImageUrl, setNewImageUrl] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  function refresh() {
    api.getProperties()
      .then((data) => setProperties(data as Property[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to reach the backend'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleToggle(property: Property) {
    setSavingId(property.id);
    try {
      await api.updateProperty(property.id, {
        isAdvertised: !property.isAdvertised,
        listingDescription: drafts[property.id] ?? property.listingDescription,
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update listing');
    } finally {
      setSavingId(null);
    }
  }

  async function handleSaveDescription(property: Property) {
    const description = drafts[property.id];
    if (description === undefined || description === property.listingDescription) return;
    setSavingId(property.id);
    try {
      await api.updateProperty(property.id, { listingDescription: description });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save description');
    } finally {
      setSavingId(null);
    }
  }

  async function handleAddImage(property: Property) {
    const url = newImageUrl[property.id]?.trim();
    if (!url) return;
    setSavingId(property.id);
    try {
      const updated = [...(property.imageUrls ?? []), url];
      await api.updateProperty(property.id, { imageUrls: updated });
      setNewImageUrl((prev) => ({ ...prev, [property.id]: '' }));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That doesn\'t look like a valid image URL');
    } finally {
      setSavingId(null);
    }
  }

  async function handleRemoveImage(property: Property, index: number) {
    setSavingId(property.id);
    try {
      const updated = (property.imageUrls ?? []).filter((_, i) => i !== index);
      await api.updateProperty(property.id, { imageUrls: updated });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove photo');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading properties…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Properties</h2>
        <p className="text-sm text-gray-600 mt-1">
          Advertise a vacant unit to publish it on the public marketing site — prospective tenants can browse and
          book a viewing directly, and you'll be notified the moment they do.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {properties.map((p) => (
          <div key={p.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">{p.title}</h3>
                <p className="text-sm text-gray-500">{p.address}, {p.lga}, {p.state}</p>
                <p className="text-sm text-gray-700 mt-1 font-medium">
                  {currencyFormatter.format(p.rentAmount)}{p.propertyType === 'LONG_TERM' && '/yr'}
                </p>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                  p.isAdvertised ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {p.isAdvertised ? 'Advertised' : 'Not listed'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Photos {p.imageUrls?.length ? `(${p.imageUrls.length})` : ''}
              </label>
              {!p.imageUrls?.length && (
                <p className="text-xs text-gray-400 mb-2">
                  No photos yet — the public listing shows a labeled sample layout until you add some.
                </p>
              )}
              {!!p.imageUrls?.length && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {p.imageUrls.map((url, i) => (
                    <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                      <img src={url} alt={`${p.title} ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleRemoveImage(p, i)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold"
                        aria-label="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newImageUrl[p.id] ?? ''}
                  onChange={(e) => setNewImageUrl((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="Paste an image URL…"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => handleAddImage(p)}
                  disabled={savingId === p.id || !newImageUrl[p.id]?.trim()}
                  className="text-sm font-medium border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Public listing description</label>
              <textarea
                value={drafts[p.id] ?? p.listingDescription ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                onBlur={() => handleSaveDescription(p)}
                placeholder="A short description shown on the public listings page…"
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <button
              onClick={() => handleToggle(p)}
              disabled={savingId === p.id}
              className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                p.isAdvertised
                  ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {savingId === p.id ? 'Saving…' : p.isAdvertised ? 'Unpublish listing' : 'Advertise on public site'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PropertiesPage;
