# EstateCopilot — going live for the pilot

`MOCK_MODE=true` runs the whole system on canned data with zero credentials.
Going live is **per pillar**: each service in `backend/src/services/*.ts` falls
back to mock behaviour on its own when its key is missing, so you can turn on
one pillar at a time. Flip `MOCK_MODE=false` in `backend/.env` once the first
real pillar is wired.

## 0. What already exists (checked 2026-09-04)

In Azure subscription `Visual Studio Enterprise`, resource group **`estatecopilot-rg`** (West Europe):

- **`estatecopilot-api`** Web App — Linux, `NODE|22-lts`, **Running**, on plan `estatecopilot-plan` (**F1 Free**). `https://estatecopilot-api.azurewebsites.net` is live and serving the app in `MOCK_MODE=true`.
- Static Web Apps `estatecopilot-landlord` / `-marketing` / `-tenant`, each with its `AZURE_SWA_TOKEN_*` repo secret already set and a `deploy-*.yml` workflow.
- App settings already present: `TENANT_JWT_SECRET`, `LANDLORD_JWT_SECRET` (set), the full `SHAREPOINT_*` block, `MARKETING_SIGNUP_CALLBACK_URL`, `TENANT_PORTAL_URL`.
- ⚠️ `DATABASE_URL` is a **placeholder** (`postgresql://…@localhost:5432/unused`). There is **no Postgres server** in the subscription yet.
- No GitHub Actions deployment is wired to `estatecopilot-api` yet (it was last pushed some other way).

## 1. Finish the infrastructure (once)

### 1a. Wire CI deploy for the API

```bash
# repo root
az webapp deployment list-publishing-profiles -g estatecopilot-rg -n estatecopilot-api --xml \
  | gh secret set AZURE_WEBAPP_PUBLISH_PROFILE_API
az webapp config appsettings set -g estatecopilot-rg -n estatecopilot-api --settings \
  SCM_DO_BUILD_DURING_DEPLOYMENT=false
az webapp config set -g estatecopilot-rg -n estatecopilot-api --startup-file "npm run start"
```

Then push `main` — `.github/workflows/deploy-api.yml` builds and deploys. The API keeps running in `MOCK_MODE` until step 1c.

### 1b. Create Postgres

```bash
az postgres flexible-server create -g estatecopilot-rg -n estatecopilot-db -l westeurope \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
  --admin-user ecadmin --admin-password '<choose-a-strong-one>' \
  --public-access 0.0.0.0 --yes            # 0.0.0.0 == "allow Azure services"
az postgres flexible-server db create -g estatecopilot-rg -s estatecopilot-db -d estatecopilot
```

### 1c. Point the app at it, migrate, leave mock mode

```bash
DBURL='postgresql://ecadmin:<the-password>@estatecopilot-db.postgres.database.azure.com:5432/estatecopilot?sslmode=require'

# migrate from your machine (the initial migration is committed at
# backend/prisma/migrations/0000000000000_init)
cd backend && DATABASE_URL="$DBURL" npm run prisma:deploy && cd ..

az webapp config appsettings set -g estatecopilot-rg -n estatecopilot-api --settings \
  DATABASE_URL="$DBURL" MOCK_MODE=false ADMIN_API_KEY='<choose-a-strong-one>' \
  PAYSTACK_HOSTED_PAGE_URL='https://paystack.shop/pay/estatecopilot' \
  LANDLORD_SUBSCRIPTION_AMOUNT_KOBO=1000000
az webapp restart -g estatecopilot-rg -n estatecopilot-api
```

> `estatecopilot-api` is on the **F1 Free** plan — no Always-On, 60 CPU-min/day.
> Fine to start; before real WhatsApp/Paystack traffic, bump it:
> `az appservice plan update -g estatecopilot-rg -n estatecopilot-plan --sku B1`
> and `az webapp config set -g estatecopilot-rg -n estatecopilot-api --always-on true`.

### 1d. Domains & JWT secrets

- `TENANT_JWT_SECRET` / `LANDLORD_JWT_SECRET` are already set on the Web App — rotate them to fresh long random strings if the current values were ever the dev default.
- Bind `landlord.` / `tenant.` / `www.estatecopilot.org` as custom domains on the three Static Web Apps.

## 1. Landlord subscription — pilot path (hosted page + manual activate)

No Paystack secret key or Plan code needed.

1. `PAYSTACK_HOSTED_PAGE_URL=https://paystack.shop/pay/estatecopilot` (already the default).
2. `ADMIN_API_KEY=<long random string>`.
3. A landlord signs up on the marketing site → account is created `PENDING_PAYMENT` → they're sent to the Paystack page to pay ₦10,000.
4. When Paystack shows the payment, activate them:
   ```bash
   curl -s https://estatecopilot-api.azurewebsites.net/api/landlord-auth/admin/activate \
     -H "x-admin-key: $ADMIN_API_KEY" -H "content-type: application/json" \
     -d '{"email":"landlord@example.com"}'
   ```
   List who's waiting: `GET /api/landlord-auth/admin/pending` with the same header.
5. The landlord logs in at `landlord.estatecopilot.org` and now has full portal access. Access is re-checked on **every** request, so a lapsed landlord is locked out immediately.

> To switch to real recurring billing later: create a ₦10,000/month Plan in the
> Paystack dashboard, set `PAYSTACK_SECRET_KEY` + `PAYSTACK_LANDLORD_PLAN_CODE`,
> and signup automatically uses the full subscription flow again
> (`backend/src/services/paystackSubscription.ts`).

## 2. Rent collection (Pillar B)

- `PAYSTACK_SECRET_KEY` (live).
- Each landlord connects **their own** bank account as a Paystack Subaccount from the portal's Settings page — rent then settles directly to them; the platform key never holds tenant money.
- Point the Paystack webhook at `POST /api/payments/webhook/paystack`. `charge.success` events are reconciled to a tenancy (by payer email, then dedicated-account number) and written to the `Payment` table; the landlord sees them under **Finance & Levies → Rent received**. Retries are de-duplicated on `providerRef`.

## 3. Tenant vetting (Pillar A)

- `SMILE_ID_PARTNER_ID`, `SMILE_ID_API_KEY` (NIN), `MONO_SECRET_KEY` (BVN).
- The BVN itself is never stored — only the match verdict (`backend/src/services/bvnVerification.ts`).

## 4. WhatsApp engine

- `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET`, and a `META_WEBHOOK_VERIFY_TOKEN` you choose.
- In Meta's dashboard set the webhook to `GET/POST https://estatecopilot-api.azurewebsites.net/webhooks/whatsapp` with that verify token, and subscribe to `messages`.
- Inbound messages are now classified (`backend/src/services/whatsappIntent.ts`): 11-digit NIN/BVN, guarantor YES/STOP, maintenance report, rent reply, greeting. The sender gets an automatic acknowledgement; the message + reply are stored on `WhatsAppMessage`. If `ANTHROPIC_API_KEY` is set, low-confidence messages are additionally classified by Claude.
- Twilio is supported as an alternative at `/webhooks/whatsapp/twilio` (replies inline via TwiML).

## 5. Email notifications

- `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY=<resend key>`, `EMAIL_FROM="EstateCopilot <ops@yourdomain>"` (the from-domain must be verified in Resend).
- Unset => ops alerts (viewings, artisan quotes) log to the console only.

## 6. AI reply drafting (optional)

- `ANTHROPIC_API_KEY`. Without it, correspondence drafts are templated — still fully functional. Drafts are always held for landlord review, never sent automatically.

## 7. Marketing walkthrough video (optional)

- Set `VITE_WALKTHROUGH_VIDEO_URL` in `marketing/.env.production` to a YouTube/Vimeo watch URL or a direct `.mp4`. Until then the homepage shows a "video coming soon" card.

## Pilot go / no-go checklist

- [ ] Postgres provisioned, `prisma migrate deploy` applied
- [ ] `estatecopilot-api` deployed, `MOCK_MODE=false`, JWT secrets set
- [ ] `ADMIN_API_KEY` set; `/admin/pending` and `/admin/activate` reachable
- [ ] Paystack hosted page reachable, one real landlord activated end-to-end
- [ ] Landlord connected a subaccount; a test rent charge shows under Finance & Levies
- [ ] WhatsApp webhook verified; a test inbound gets an auto-acknowledgement
- [ ] Resend sending real mail (or accepted as console-only for the pilot)
- [ ] `landlord.` / `tenant.` / `www.` domains resolve with HTTPS
