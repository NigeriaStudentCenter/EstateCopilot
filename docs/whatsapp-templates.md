# WhatsApp message templates

Submit these in WhatsApp Manager → Message templates once the portfolio
restriction is lifted. Naming: `lowercase_snake`. Keep the `{{n}}` count
low — Meta rejects templates with unexplained variables or thin content.

`templateName` in a `WaCampaign` must match the approved name exactly;
`templateLang` must match the approved language (`en` here).

Body variables are filled positionally by `sendWhatsAppTemplate(to, name,
lang, [param1, param2, …])`. A campaign resolves them per recipient from
`audienceQuery.paramFields` — an ordered list of segment field names that
map to `{{1}}, {{2}}, …`. Fields by segment: all → `phone`; `artisan_leads`
→ `name`; `tenancies_expiring` → `name`, `propertyTitle`, `leaseEnd`;
`landlords_no_listing` → `name`; `consented` → `brand`. A missing field
resolves to "".

Example — the lease-renewal campaign:
`{ "segment": "tenancies_expiring", "withinDays": 60,
   "paramFields": ["name", "propertyTitle", "leaseEnd"] }`
fills a template whose body is `Hi {{1}}, your lease at {{2}} ends {{3}} …`.

Templates below that use `{{n}}` no longer need engine changes — just a
segment that exposes the right fields.

---

## EstateCopilot

### `ec_listing_reengage_v1` — MARKETING
Re-engage a lead who enquired but didn't convert.

- **Body:**
  `Hi, it's EstateCopilot. You were looking for a place a little while back — are you still searching? Reply here and tell us your area and budget and we'll send you fresh verified listings.`
- **Footer:** `Reply STOP to unsubscribe`
- Variables: none.

### `ec_new_listing_alert_v1` — MARKETING
New listing in an area a contact asked about.

- **Body:**
  `New on EstateCopilot in {{1}}: {{2}}, {{3}}/year. Verified landlord. Reply here to see photos or book a viewing.`
- **Footer:** `Reply STOP to unsubscribe`
- Variables: `{{1}}` area, `{{2}}` short title, `{{3}}` rent (e.g. "₦6,500,000").

### `ec_viewing_confirmation_v1` — UTILITY
Confirm a viewing slot ops has set.

- **Body:**
  `Your viewing is confirmed: {{1}} on {{2}}. The agent's contact is {{3}}. Reply here if you need to change it.`
- Variables: `{{1}}` listing, `{{2}}` date/time, `{{3}}` phone.

---

## AI Academy

### `aia_enquiry_followup_v1` — MARKETING
Follow up an enrolment enquiry that didn't complete onboarding.

- **Body:**
  `Hi, it's AI Academy. You asked about our online AI classes. To reserve a place, complete the short onboarding form: {{1}} — the team then confirms the schedule. Fees are ₦20,000/month (Nigeria) or £10/month (UK).`
- **Footer:** `Reply STOP to unsubscribe`
- Variables: `{{1}}` onboarding URL (pass as a static per-campaign paramField, or hardcode in the approved template).

### `aia_class_reminder_v1` — UTILITY
Remind an enrolled family of the next class.

- **Body:**
  `Reminder: {{1}}'s AI Academy class is on {{2}}. Join link: {{3}}.`
- Variables: `{{1}}` student first name, `{{2}}` date/time, `{{3}}` join link.

---

## Shared

### `wa_optin_confirmation_v1` — UTILITY
Sent right after someone ticks the WhatsApp opt-in box on a form.

- **Body:**
  `Thanks — you'll now get updates from {{1}} on WhatsApp. Reply STOP any time to unsubscribe.`
- Variables: `{{1}}` "EstateCopilot" or "AI Academy".

---

## Notes for approval

- Every MARKETING template carries an explicit opt-out line ("Reply STOP…").
- No promotional superlatives, no shortened/cloaked links — use the real
  `estatecopilot.org` URL.
- MARKETING messages are billed per message; UTILITY is cheaper and less
  policy-sensitive — prefer UTILITY where the message is genuinely
  transactional (confirmations, reminders).
- After approval, add the ability to pass per-recipient body params to
  `runCampaign` (currently it sends templates with no variables).
