import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Property } from '../../types';

const AMENITY_SUGGESTIONS = ['Wi-Fi', 'Generator', 'Inverter/solar', 'Air conditioning', 'Kitchen', 'Water', 'Reading desk', '24h security', 'Parking', 'Laundry'];

// Stays marketplace settings for one SHORT_LET property: monthly price,
// what's let (whole place / room), whether students can request it, and
// what's included. Saved in one PATCH.
const StaySettings: React.FC<{ property: Property; onSaved: () => void; onError: (msg: string) => void }> = ({ property, onSaved, onError }) => {
  const [monthlyRate, setMonthlyRate] = useState(property.monthlyRate?.toString() ?? '');
  const [unit, setUnit] = useState(property.stayUnitType ?? '');
  // Which marketplace section(s) it appears in.
  type Audience = 'DAILY' | 'STUDENT' | 'BOTH';
  const [audience, setAudience] = useState<Audience>(
    property.studentFriendly ? (property.dailyStays === false ? 'STUDENT' : 'BOTH') : 'DAILY',
  );
  const studentFriendly = audience !== 'DAILY';
  const [nearUniversity, setNearUniversity] = useState(property.nearUniversity ?? '');
  const [maxGuests, setMaxGuests] = useState(property.maxGuests?.toString() ?? '');
  const [amenities, setAmenities] = useState<string[]>(property.amenities ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleAmenity(a: string) {
    setAmenities((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateProperty(property.id, {
        monthlyRate: monthlyRate ? Number(monthlyRate) : null,
        stayUnitType: (unit || null) as Property['stayUnitType'],
        studentFriendly,
        dailyStays: audience !== 'STUDENT',
        nearUniversity: nearUniversity.trim() || null,
        maxGuests: maxGuests ? Number(maxGuests) : null,
        amenities,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save stay settings');
    } finally {
      setSaving(false);
    }
  }

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSaved(false); };

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <label className="block text-xs font-medium text-gray-500 uppercase">Stay settings</label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input type="number" min={1} value={monthlyRate} onChange={(e) => touch(setMonthlyRate)(e.target.value)} placeholder="Monthly rate (₦, 28 nights)" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        <select value={unit} onChange={(e) => touch(setUnit)(e.target.value as typeof unit)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">What's let?</option>
          <option value="ENTIRE_PLACE">Entire place</option>
          <option value="PRIVATE_ROOM">Private room</option>
          <option value="SHARED_ROOM">Shared room</option>
        </select>
        <input type="number" min={1} max={30} value={maxGuests} onChange={(e) => touch(setMaxGuests)(e.target.value)} placeholder="Max guests" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <div>
        <p className="text-sm text-gray-700 mb-1.5">Who is it for?</p>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {([['DAILY', 'Daily guests'], ['STUDENT', 'Students'], ['BOTH', 'Both']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => touch(setAudience)(v)} className={`px-3 py-1.5 ${audience === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {audience === 'DAILY' && 'Listed under Daily stays. Guests verify with BVN/NIN and book instantly.'}
          {audience === 'STUDENT' && 'Listed under Student stays only. Students send their student ID; you approve before they pay.'}
          {audience === 'BOTH' && 'Listed in both sections: daily guests book instantly, students send their ID for your approval.'}
        </p>
      </div>
      {studentFriendly && (
        <input value={nearUniversity} onChange={(e) => touch(setNearUniversity)(e.target.value)} placeholder="Nearest school, e.g. UNILAG, Akoka" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
      )}
      <div className="flex flex-wrap gap-1.5">
        {AMENITY_SUGGESTIONS.map((a) => (
          <button key={a} type="button" onClick={() => toggleAmenity(a)} className={`px-2.5 py-1 rounded-full text-xs border ${amenities.includes(a) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300'}`}>
            {a}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="text-sm font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save stay settings'}
        </button>
        {saved && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
    </div>
  );
};

export default StaySettings;
