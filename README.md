# EstateCopilot

Autonomous property management infrastructure for the Nigerian real estate market — long-term leases and short-lets, tenant vetting, WhatsApp-first operations, and local levy/utility compliance.

## Structure

- `frontend/` — React + TypeScript + Tailwind **landlord portal** (Vite). Dashboard, Tenancies (reminders, Paystack payment plans, correspondence), Maintenance, and the AI Inbox.
- `tenant-portal/` — React + TypeScript + Tailwind **tenant-facing app** (Vite). Tenants sign up with a tenancy ID their landlord gives them, then see their lease, message their landlord, and report repairs.
- `marketing/` — React + TypeScript + Tailwind **public marketing site** (Vite). The landing page that sells landlords on signing up, plus two public marketplaces: vacant-property listings with a viewing-booking flow, and open repair jobs artisans can quote or book a site visit for.
- `backend/` — Express + TypeScript + Prisma API and WhatsApp Webhook Engine. Boots in `MOCK_MODE` with zero external credentials.

## Run it today

```bash
# Terminal 1
cd backend && cp .env.example .env && npm install && npm run dev   # http://localhost:4000

# Terminal 2
cd frontend && npm install && npm run dev                          # http://localhost:5173 (landlord)

# Terminal 3
cd tenant-portal && npm install && npm run dev                     # http://localhost:5174 (tenant)

# Terminal 4
cd marketing && npm install && npm run dev                         # http://localhost:5175 (public site)
```

With `MOCK_MODE=true` (the default), every backend route — vetting, payments, levies, maintenance, WhatsApp, tenant auth, landlord auth/subscription, AI drafting — returns realistic canned responses. No Postgres instance, no Meta/Twilio/Paystack/Smile ID/Anthropic keys required to see the whole shape of the system working.

To try the tenant portal, sign up at `localhost:5174` with tenancy ID `t1`, `t2`, or `t3` (the demo tenancies) and any email/password. To try the landlord side, sign up at `localhost:5175/signup` — it walks through the ₦10,000/month subscription (mock-confirmed instantly, no real card) and drops you straight into the authenticated landlord portal.

> **Known flakiness in this dev setup:** `tsx watch` (the backend's `npm run dev`) can occasionally fall into a restart loop after many rapid file saves and never settle into a listening state. If `curl localhost:4000/health` hangs, kill the process (`pkill -f "tsx watch"`) and run `npx tsx src/index.ts` (no `watch`) instead — that's unaffected since it doesn't file-watch at all; you'll just need to restart it by hand after further edits.

## How tenant ↔ landlord correspondence works

1. A tenant sends a message in the tenant portal → it's logged immediately as an inbound message the landlord can see in Tenancies → Correspondence.
2. The AI agent (`backend/src/services/aiReply.ts`) drafts a reply in the landlord's voice — template-based in mock mode, or written by Claude if `ANTHROPIC_API_KEY` is set.
3. The draft sits in the landlord portal's **AI Inbox**, pending review. It is never sent automatically.
4. The landlord approves as-is, edits the text and sends, or rejects it. Only on approval does it become a real outbound message the tenant sees.

Reminders (90/60/30-day lease renewal, and the payment-due nudge fired when a rent payment plan is generated) are logged into the same correspondence thread automatically, so a tenant sees them alongside human messages.

## Repair responsibility checklist

When a tenant reports a repair, they tick one item from a checklist (`backend/src/lib/repairChecklist.ts`) split into two groups — structural/core-building items that are the landlord's responsibility, and day-to-day upkeep items that are the tenant's — mirroring how Nigerian tenancy agreements typically divide repair obligations. The tenant sees an immediate banner ("typically covered by your landlord" / "typically your responsibility") before they even submit. The responsibility verdict is always resolved server-side from the category id, never taken from client input, and both the landlord's Maintenance page and the AI Inbox show the resulting badge so nobody has to guess who's on the hook. The AI's drafted reply is told the verdict directly, so it states it plainly instead of inventing an answer.

## Public listings, viewings, and the artisan marketplace

- A landlord toggles **Advertise on public site** on the Properties page (`PATCH /api/properties/:id`) — that's what makes a unit appear on `marketing`'s `/properties` page. Visitors pick a date/time and book a viewing (`POST /api/public/properties/:id/book-viewing`); ops gets a WhatsApp + email alert immediately (`backend/src/lib/notifyOps.ts`) and the request shows up in the landlord portal's **Bookings** page, grouped by date like an agenda/calendar.
- A landlord toggles **List on marketplace** on a maintenance ticket to publish it to `marketing`'s `/handymen` page (exact address withheld — only LGA/state, category, and description are shown until a quote is accepted). Artisans either submit a quote directly or book a site visit first if they need to see the job to price it accurately — both routed the same way, and both notify ops. The landlord accepts a quote from the Maintenance page, which dispatches the ticket and records the artisan's contact info.
- `EMAIL_PROVIDER`/`EMAIL_API_KEY` are unset by default, so email notifications just log to the console (`backend/src/services/email.ts`) — same mock-first pattern as everything else. `OPS_WHATSAPP_NUMBER` / `OPS_EMAIL` control where the alerts go.

## Landlord signup & the ₦10,000/month subscription

Landlords don't get free access — `marketing`'s `/signup` collects account details, starts a Paystack subscription transaction for a flat ₦10,000/month (`backend/src/services/paystackSubscription.ts`), and only marks the account `ACTIVE` once that payment is verified (`POST /api/landlord-auth/confirm`). In mock mode this is a one-click "Pay with Paystack (test mode)" confirmation with no real card; in live mode it's a real Paystack-hosted checkout redirect. Every landlord-portal route (`properties`, `tenancies`, `maintenance` tickets/quotes, `correspondence`, `ai-drafts`, `bookings`, `levies`, `vetting`) requires a valid landlord session **and** re-checks `subscriptionStatus === ACTIVE` on every request — not just at login — so a failed renewal locks a landlord out immediately, not just at token expiry. The `/api/maintenance/checklist`, `/api/public/*`, and payment-webhook routes are deliberately exempt (tenants, prospective tenants, and Paystack itself have no landlord session).

Going live needs both `PAYSTACK_SECRET_KEY` and a pre-created Paystack Plan (`PAYSTACK_LANDLORD_PLAN_CODE`) — Paystack has no way to attach a plan to a transaction without one existing first, so create it once from the Paystack dashboard (Payments → Plans, ₦10,000, monthly) and paste the code in.

## Going live, integration by integration

Flip `MOCK_MODE=false` in `backend/.env` only once you've filled in the keys for whichever pillar you're activating — the mock/live switch is per-service, not all-or-nothing in practice, since each service file (`backend/src/services/*.ts`) falls back to mock behavior individually when its own key is missing.

| Pillar | Needs | Get it from |
|---|---|---|
| Tenant vetting (NIN/BVN) | `SMILE_ID_*`, `MONO_SECRET_KEY` | smileidentity.com, mono.co |
| Rent/deposit collection | `PAYSTACK_SECRET_KEY` or `FLUTTERWAVE_SECRET_KEY` | paystack.com, flutterwave.com |
| WhatsApp messaging | `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WEBHOOK_VERIFY_TOKEN` | developers.facebook.com (WhatsApp Cloud API) |
| Database persistence | `DATABASE_URL` | any Postgres — Supabase/Neon/Railway free tier works for a pilot |
| AI reply drafting | `ANTHROPIC_API_KEY` | console.anthropic.com — optional, falls back to templated drafts without it |
| Tenant portal login | `TENANT_JWT_SECRET` | any random string — required before a real deploy, defaults to an insecure dev value |
| Landlord portal login + subscription | `LANDLORD_JWT_SECRET`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_LANDLORD_PLAN_CODE` | any random string + paystack.com dashboard |

Once `DATABASE_URL` is set: `npx prisma migrate dev` inside `backend/` creates the tables from `prisma/schema.prisma`.

## Positioning

This is not "AI that replaces letting agents." See the roadmap/sales artifact for the full pitch, but in short: sell it to landlords as an automated asset manager, and to existing agents as a copilot that lets one agent run 200 units instead of 20.
