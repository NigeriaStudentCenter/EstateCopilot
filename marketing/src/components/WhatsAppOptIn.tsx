import React from 'react';

// The exact wording the user agrees to — sent to the backend as `optInText`
// and stored with the consent record, so keep this string stable and use it
// everywhere the checkbox appears.
export const WHATSAPP_OPT_IN_TEXT =
  'Send me updates and offers from EstateCopilot on WhatsApp. I can reply STOP any time.';

const WhatsAppOptIn: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 shrink-0"
    />
    <span>{WHATSAPP_OPT_IN_TEXT}</span>
  </label>
);

export default WhatsAppOptIn;
