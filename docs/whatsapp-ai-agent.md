# WhatsApp Marketing AI Agent

Brand-aware conversational agent on the shared WhatsApp number
("AI Academy/EstateCopilot"). Answers inbound enquiries for **EstateCopilot**
(rentals, verified artisans) and **AI Academy** (classes for young people),
calls tools for real data / lead capture, and hands off to a human for
anything financial, legal, or contractual.

## Status

**Built (works in `MOCK_MODE`, no DB, no Meta):**

- `backend/src/services/whatsapp/brands.ts` — the two brand profiles
  (persona, scope, facts) + brand detection (entry tag `[EC]`/`[AIA]`,
  keyword fallback, else `UNKNOWN` → agent asks which service).
- `backend/src/services/whatsapp/conversationStore.ts` — conversation +
  message persistence. In-memory in mock mode; Prisma
  (`WaContact`/`WaConversation`/`WhatsAppMessage`) otherwise.
- `backend/src/services/whatsapp/tools.ts` — agent tools:
  - EstateCopilot: `search_listings`, `get_listing_details`, `book_viewing`,
    `search_artisans`, `request_artisan_quote`, `capture_lead`
  - AI Academy: `get_academy_info`, `capture_academy_lead`
  - shared: `escalate_to_human` (sets conversation `HUMAN_ACTIVE`, agent
    then stays silent)
- `backend/src/services/whatsapp/agent.ts` — the Claude tool-use loop.
  Haiku by default; escalates the model for unknown brand / long messages /
  complaints / legal topics. Never throws — degrades to an acknowledgement
  plus an ops alert.
- Wiring in `backend/src/routes/whatsapp.ts`, gated by `WA_AGENT_ENABLED`
  (default **false** — existing tenant/guarantor-ops classifier untouched).
- `POST /webhooks/whatsapp/simulate` (mock only) — drive the agent with a
  fake inbound message, no Meta.
- `backend/src/services/whatsapp/consent.ts` + `POST /api/whatsapp/consent`
  and `POST /api/whatsapp/opt-out` — logged marketing opt-in/out
  (`WaConsent`). Inbound `STOP` / `UNSUBSCRIBE` is caught in the agent
  before the LLM: records the opt-out, closes the conversation, sends a
  confirmation. `hasMarketingConsent(phone)` is the gate campaigns will use.
- `backend/src/services/whatsapp/campaigns.ts` + `sendWhatsAppTemplate()` —
  outbound campaign engine. Audience segments (`phones`, `consented` by
  brand, `artisan_leads` with age/status filters); every send gated on
  `hasMarketingConsent` + a `WA_CAMPAIGN_MIN_GAP_DAYS` frequency cap;
  throttled sender (`WA_CAMPAIGN_THROTTLE_PER_MIN`). Endpoints (admin-key
  guarded in real mode): `POST/GET /api/whatsapp/campaigns`, `GET /:id`,
  `POST /:id/preview` (dry run), `POST /:id/send`.
- Prisma models: `WaContact`, `WaConsent`, `WaConversation`, `WaCampaign`
  + `WaBrand`/`WaConversationState`/`WaCampaignStatus` enums; run
  `npm run prisma:migrate` to create the migration.
- Compliance drafts: `docs/whatsapp-compliance.md`.

**Not built yet:**

- Campaign worker — `runCampaign` streams from the API process (capped at
  500/run); a large audience needs a dedicated WebJob. `scheduleAt` is
  stored but nothing acts on it yet.
- More audience segments (leases expiring, landlords with no listing).
- Template library + Meta submission.
- The marketing-site checkbox that calls `POST /api/whatsapp/consent`
  (backend endpoint is done; the `marketing/` form change is not).
- Ops console (human takeover UI).
- Splitting ops vs marketing on the one number (per keyword / per campaign).
- Remaining AI Academy content — `brands.ts` `AI_ACADEMY.faq` covers three
  programmes (teens 10–17 parent/guardian-only, university students, working
  professionals), all online, same fee for all: ₦20,000/mo NG · £10/mo UK.
  Still to confirm: university & professional track names, class days/times,
  term dates, safeguarding policy link.

## Try it

```bash
cd backend && npm run dev          # MOCK_MODE=true, no keys needed
curl -XPOST localhost:4000/webhooks/whatsapp/simulate \
  -H 'content-type: application/json' \
  -d '{"from":"2348030004444","text":"[EC] 3-bed in Lekki under 8m?"}'
```

With no `ANTHROPIC_API_KEY` the agent returns a plain acknowledgement and the
brand it detected. Set `ANTHROPIC_API_KEY` to exercise the full tool-use loop
(still no Meta / no DB needed).

## Going live (after the Meta portfolio restriction is lifted)

1. Fill the `META_WHATSAPP_*` + `META_APP_SECRET` env vars on
   `estatecopilot-api`, plus `ANTHROPIC_API_KEY`.
2. Register the webhook (`/webhooks/whatsapp`) in the Meta app, subscribe to
   `messages`.
3. `npm run prisma:deploy` to apply the migration.
4. Set `WA_AGENT_ENABLED=true`.
5. Publish the privacy policy and complete the Data Protection Assessment
   (`docs/whatsapp-compliance.md`).
