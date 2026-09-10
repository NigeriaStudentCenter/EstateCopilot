# AI Academy on Wheels — enrolment automation

For the **university / professional** programme only. (Teens stay on the
lightweight "parent fills a form, team follows up" path — no account
provisioning.)

**Two intake paths — same Microsoft 365 work. Path A is the default (no
premium connector needed).**

**Path A — SharePoint list + backend poller (recommended):**
Microsoft Form → Power Automate flow (Forms trigger → *Get response details*
→ **SharePoint "Create item"**) writes a row to the **AI Academy Enrolments**
list on `…/sites/AIAcademy` with `Status` blank. The backend
(`AI_ACADEMY_ENROL_POLL=true`) polls that list every ~2 min, and for each new
row:

1. creates the learner's account — `first.last@bsoedu.org`
2. assigns the **Microsoft 365 A1 for students** licence
3. adds them to the **"AI Academy"** team
4. emails their sign-in details + class info to their personal address
5. writes the outcome back to the row — `Status` → `Active` / `Failed`,
   `AccountUPN`, `ProvisionNote`

The poller claims each row (`Status` → `Processing`) before working it, so an
overlapping tick or a second instance skips it.

**Path B — HTTP:** `POST /api/ai-academy/enrol` with `AI_ACADEMY_ENROL_SECRET`
(needs the **premium** HTTP action). Same 1–4, plus it creates the list row
itself. Always returns 200 with a per-step report so the flow never retries
and double-provisions.

Code: `backend/src/services/aiAcademy/{provision,poller}.ts`,
`backend/src/routes/aiAcademy.ts`. Config: `AI_ACADEMY_*` in
`backend/.env.example`. Path A is off until `AI_ACADEMY_ENROL_POLL=true`;
Path B's route is 404 until `AI_ACADEMY_ENROL_SECRET` is set.

---

## 1. One-time tenant setup (bsoed tenant — you do this)

### a. Create the "AI Academy" team — DONE
The **AI Academy** M365 group already existed (created 2026-07-24) and is a
full team: `…/sites/AIAcademy`, 11 channels, the branded `Academy-Home.aspx`
home page, ~3 GB of course content. **Do NOT "create a team from scratch"** —
that made a duplicate class team on `/sites/AIAcademy_e42cba` (deleted
2026-09-10). Use the existing one.
**Group ID = `3141a2c7-95c5-45bf-abbc-35f8d5da4c02`** → `AI_ACADEMY_TEAM_GROUP_ID`.
(Re-check any time: `az rest --method get --url
"https://bsoed.sharepoint.com/sites/AIAcademy/_api/site?\$select=GroupId"`, or
Teams admin center → Teams → AI Academy → *Group ID*.)

### b. Get the licence SKU ID — DONE
`az rest --method get --url
"https://graph.microsoft.com/v1.0/subscribedSkus?\$select=skuId,skuPartNumber,prepaidUnits,consumedUnits"`
The bsoed tenant has **no** `M365EDU_A1` / `STANDARDWOFFPACK_IW_STUDENT`; the
assignable student productivity plan is **`STANDARDWOFFPACK_STUDENT`**
("Office 365 A1 for students" — Exchange, SharePoint, Teams, web apps).
**skuId = `314c4481-f395-4525-be8b-2ec4bb1e9d91`** → `AI_ACADEMY_LICENSE_SKU_ID`.
Seats: enabled 1,000,000 / consumed 56 — plenty.
(`OFFICESUBSCRIPTION_STUDENT` — the *desktop* apps — has only 6 seats; don't
use it as the base.)

### c. Graph app permissions — TODO (needs a Global/Cloud-App admin)
App **`EstateCopilot-SharePoint-Integration`**
(appId `a82b7190-14dc-4600-b3ef-78e551e993d0`, tenant
`76691188-9b9d-47ee-bb5a-2afec52f4d5e`) — the backend already uses it via the
`SHAREPOINT_*` settings. It currently has only **`Sites.ReadWrite.All`**
(app). Add these **application** permissions + **admin consent**:

| Permission | Graph app-role id | For |
|---|---|---|
| `User.ReadWrite.All` | `741f803b-c850-494e-b5df-cde7c675a1ca` | create the learner account |
| `Group.ReadWrite.All` | `62a82d76-70ea-41e2-9197-370581804d09` | add them to the AI Academy team |
| `Mail.Send` | `b633e1c5-b582-4048-a93e-9f11b44c7e96` | the welcome email |

```bash
az ad app permission add --id a82b7190-14dc-4600-b3ef-78e551e993d0 \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions \
    741f803b-c850-494e-b5df-cde7c675a1ca=Role \
    62a82d76-70ea-41e2-9197-370581804d09=Role \
    b633e1c5-b582-4048-a93e-9f11b44c7e96=Role
az ad app permission admin-consent --id a82b7190-14dc-4600-b3ef-78e551e993d0
```
Verify: `az rest --method get --url
"https://graph.microsoft.com/v1.0/servicePrincipals(appId='a82b7190-14dc-4600-b3ef-78e551e993d0')/appRoleAssignments?\$select=resourceDisplayName,appRoleId"`
— expect 4 entries.

`Mail.Send` (app) can send as **any** mailbox — scope it with an
**ApplicationAccessPolicy** (Exchange Online PowerShell) to just
`AI_ACADEMY_WELCOME_FROM`. Recommended, not blocking.

### d. SharePoint list — DONE
The **"AI Academy Enrolments"** list already exists on
`https://bsoed.sharepoint.com/sites/AIAcademy` (created 2026-09-10), with the
12 single-line-text columns the poller reads and writes: `FirstName`,
`LastName`, `Email`, `Programme`, `Organisation`, `Country`, `Phone`,
`StartMonth`, `Status`, `AccountUPN`, `ProvisionNote`, `EnrolledAt` (plus the
built-in `Title`). All are on the default view. Nothing to do here.
(If the backend ever runs against a fresh site, it recreates this list by
name on the first poll. To point at a different list, set
`AI_ACADEMY_ENROL_LIST_ID`.)

### e. Azure App Settings on `estatecopilot-api` (`estatecopilot-rg`)

Step 1 — set the IDs now (harmless; nothing runs until POLL is on):
```bash
az webapp config appsettings set \
  --name estatecopilot-api --resource-group estatecopilot-rg \
  --settings \
    AI_ACADEMY_TEAM_GROUP_ID=3141a2c7-95c5-45bf-abbc-35f8d5da4c02 \
    AI_ACADEMY_LICENSE_SKU_ID=314c4481-f395-4525-be8b-2ec4bb1e9d91 \
    AI_ACADEMY_WELCOME_FROM=john@bsoedu.org \
  --output table
```

Step 2 — only AFTER step c (Graph permissions + admin consent) is done, flip
the poller on:
```bash
az webapp config appsettings set \
  --name estatecopilot-api --resource-group estatecopilot-rg \
  --settings AI_ACADEMY_ENROL_POLL=true --output table
```

`AI_ACADEMY_GRAPH_*` are unset — Graph auth falls back to `SHAREPOINT_*`
(same tenant/app). `AI_ACADEMY_ENROL_SECRET` only if you also want Path B.

---

## 2. The Microsoft Form — "AI Academy on Wheels — Enrolment"

Intro text:
> AI Academy on Wheels is our AI & technology programme for university
> students and working professionals. Live online classes every Friday,
> 7:00–8:00 pm West Africa Time. Monthly subscription — ₦20,000 (Nigeria) or
> £10 (UK) — rolling, start any month, cancel any time.

| # | Question | Type | Required |
|---|---|---|---|
| 1 | First name | Text | ✔ |
| 2 | Last name | Text | ✔ |
| 3 | Email address (we'll send your sign-in here) | Text | ✔ |
| 4 | Phone / WhatsApp | Text | ✔ |
| 5 | I am a… | Choice: *University student* / *Working professional* | ✔ |
| 6 | Your university & course/year, or employer & job title | Text — *e.g. "University of Lagos, 300L Computer Science" or "GTBank, Data Analyst"* | ✔ |
| 7 | Country | Choice: *Nigeria* / *United Kingdom* / *Other* | ✔ |
| 8 | State / city | Text | – |
| 9 | Preferred start month | Choice: *This month* / *Next month* | – |
| 10 | What do you most want to get out of the programme? | Long text | – |
| 11 | Please confirm (tick all) | Checkbox: *"I am 18 or older."* · *"I agree to the monthly subscription and can cancel any time."* · *"I agree to AI Academy creating a Microsoft 365 account for me for classes, and to the Privacy Notice."* | ✔ |

Set `AI_ACADEMY_ONBOARDING_URL` (App Setting) to this form's share link — the
WhatsApp agent hands it out.

---

## 3. The Power Automate flow (Path A — no premium) — BUILT

The flow **"AI Academy on Wheels — Enrolment intake"** is already built and
saved in the *British School of Outdoor Education* environment (2026-09-10),
exactly as below. It is enabled but does nothing useful until the backend
poller is switched on (§1e). To review/edit it: make.powerautomate.com →
My flows → *AI Academy on Wheels — Enrolment intake*.

1. **Trigger — Microsoft Forms: "When a new response is submitted"** → form *AI Academy on Wheels — Enrolment*.
2. **Action — Microsoft Forms: "Get response details"** → same form; Response Id from the trigger.
3. **Action — SharePoint: "Create item"**
   - Site: `AI Academy - https://bsoed.sharepoint.com/sites/AIAcademy`
   - List: **AI Academy Enrolments** (already exists, §1d)
   - Fields (each `<Qn>` = the *Get response details* dynamic token for that question):
     | Column | Value (dynamic content) |
     |---|---|
     | Title | `<Q1> <Q2>` (first + last) |
     | FirstName | `<Q1>` |
     | LastName | `<Q2>` |
     | Email | `<Q3>` |
     | Phone | `<Q4>` |
     | Programme | `<Q5>` (the raw "University student" / "Working professional" — the backend normalises it) |
     | Organisation | `<Q6>` |
     | Country | `<Q7>` |
     | StartMonth | `<Q9>` |
     | Status | *(leave blank)* |

   (`<Qn>` = the "Get response details" dynamic content for that question.)

The backend poller picks the row up within ~2 min, provisions the learner,
and sets `Status` = `Active` / `Failed` with a `ProvisionNote`. Watch the
list to see results.

### List columns (§1d) if creating it by hand
Single line of text: `FirstName`, `LastName`, `Email`, `Programme`,
`Organisation`, `Country`, `Phone`, `StartMonth`, `Status`, `AccountUPN`,
`ProvisionNote`, `EnrolledAt`. (`Title` exists by default.)

## 3b. Optional — Path B (premium HTTP action)

Replace step 3 with an **HTTP** action: `POST
https://estatecopilot-api.azurewebsites.net/api/ai-academy/enrol`, headers
`Content-Type: application/json` + `x-enrol-secret: <AI_ACADEMY_ENROL_SECRET>`,
body:
```json
{ "firstName":"<Q1>", "lastName":"<Q2>", "personalEmail":"<Q3>", "phone":"<Q4>",
  "programme":"@{if(equals(<Q5>,'Working professional'),'professional','university')}",
  "organisation":"<Q6>", "country":"<Q7>", "startMonth":"<Q9>" }
```
The response `{ ok, upn, steps }` lets you branch on a partial failure.

---

## Testing before go-live

With Graph creds absent, both paths run in **mock mode** — they log what they
would do and return a simulated report; the poller no-ops. Once the app
permissions + IDs are in, submit one real form response and
check: account created, licence shows in the M365 admin center, the person
is in the AI Academy team, a row in the SharePoint list, welcome email
received.
