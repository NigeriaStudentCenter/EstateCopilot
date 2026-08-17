import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface StateOption {
  name: string;
  slug: string;
  propertyCount: number;
  jobCount: number;
}

interface StateSelectProps {
  value: string; // slug, or '' for "All states" / unselected
  onChange: (slug: string) => void;
  includeAll?: boolean;
  required?: boolean; // when true (and includeAll is false), shows a disabled placeholder instead of defaulting to the first state
  countKey?: 'propertyCount' | 'jobCount';
  className?: string;
}

// Shared 36-states-+-FCT dropdown, backed by GET /api/public/states so the
// list and its counts always match what the backend actually has.
const StateSelect: React.FC<StateSelectProps> = ({ value, onChange, includeAll = true, required = false, countKey, className }) => {
  const [states, setStates] = useState<StateOption[]>([]);

  useEffect(() => {
    api.getStates().then(setStates).catch(() => setStates([]));
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={className ?? 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white'}
    >
      {includeAll && <option value="">All states</option>}
      {!includeAll && required && <option value="" disabled>Select your state</option>}
      {states.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.name}{countKey ? ` (${s[countKey]})` : ''}
        </option>
      ))}
    </select>
  );
};

export default StateSelect;
