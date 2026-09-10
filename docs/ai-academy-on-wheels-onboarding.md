# AI Academy on Wheels — enrolment automation

For the **university / professional** programme only. (Teens stay on the
lightweight "parent fills a form, team follows up" path — no account
provisioning.)

**Flow:** Microsoft Form → one-step Power Automate flow → `POST /api/ai-academy/enrol`
on `estatecopilot-api` → the backend does the Microsoft 365 side via app-only
Graph:

1. create the learner's account — `first.last@bsoedu.org`
2. assign the **Microsoft 365 A1 for students** licence
3. add them to the **"AI Academy"** team
4. write a row to the **AI Academy Enrolments** SharePoint list on `…/sites/AIAcademy`
5. email their sign-in details + class info to their personal address

Every step is independent and best-effort; the endpoint returns a per-step
report (`{ ok, mock, upn, steps: {...} }`) so the flow can flag a partial
failure. It never returns non-2xx for a provisioning error (that would make
the flow retry and double-provision).

Code: `backend/src/routes/aiAcademy.ts`, `backend/src/services/aiAcademy/provision.ts`.
Config: `AI_ACADEMY_*` in `backend/.env.example`. Route is **404 until
`AI_ACADEMY_ENROL_SECRET` is set.**

---

## 1. One-time tenant setup (bsoed tenant — you do this)

### a. Create the "AI Academy" team
Teams → **Join or create a team → Create team → From scratch → Private** →
name it **AI Academy**. Then get its **Group ID**:
Teams admin center → Teams → AI Academy → *Group ID*, or
Entra admin center → Groups → AI Academy → *Object ID*.
→ set `AI_ACADEMY_TEAM_GROUP_ID`.

### b. Get the licence SKU ID
Graph Explorer (or any Graph call), signed in as an admin:
```
GET https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuId,skuPartNumber,prepaidUnits,consumedUnits
```
Find the row whose `skuPartNumber` is the A1-for-students one
(`STANDARDWOFFPACK_IW_STUDENT`, or `M365EDU_A1` depending on how it was
bought), copy its `skuId` GUID.
→ set `AI_ACADEMY_LICENSE_SKU_ID`. Confirm `prepaidUnits.enabled - consumedUnits`
leaves enough seats.

### c. Graph app permissions
The app `services/sharepoint.ts` already uses (client-credentials, bsoed
tenant) needs these **application** permissions added, with **admin consent**:

| Permission | For |
|---|---|
| `User.ReadWrite.All` | create the learner account |
| `Group.ReadWrite.All` | add them to the AI Academy group/team |
| `Sites.ReadWrite.All` | the enrolment list (already has this) |
| `Mail.Send` | the welcome email |
| `Organization.Read.All` | *(optional)* read `subscribedSkus` |

`Mail.Send` as an app permission can send as **any** mailbox — scope it with
an **ApplicationAccessPolicy** to just `AI_ACADEMY_WELCOME_FROM` (e.g. a
shared mailbox `aiacademy@bsoedu.org`).

Reuse the SharePoint app → nothing else to set. New app → set
`AI_ACADEMY_GRAPH_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET`.

### d. SharePoint list
Nothing to do — the backend creates **"AI Academy Enrolments"** on
`…/sites/AIAcademy` on the first real run (columns: Email, Programme,
Organisation, Country, Phone, AccountUPN, StartMonth, Status, EnrolledAt).
To use an existing list instead, set `AI_ACADEMY_ENROL_LIST_ID`.

### e. Azure App Settings on `estatecopilot-api`
```
AI_ACADEMY_ENROL_SECRET      = <a long random string>   # also goes in the flow
AI_ACADEMY_TEAM_GROUP_ID     = <from step a>
AI_ACADEMY_LICENSE_SKU_ID    = <from step b>
AI_ACADEMY_WELCOME_FROM      = aiacademy@bsoedu.org      # optional, defaults to john@
# AI_ACADEMY_GRAPH_* only if NOT reusing the SharePoint app
```

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

## 3. The Power Automate flow (3 steps)

1. **Trigger — Microsoft Forms: "When a new response is submitted"**
   Form Id: the form above.

2. **Action — Microsoft Forms: "Get response details"**
   Form Id: same. Response Id: `Response Id` from the trigger.

3. **Action — HTTP**
   - Method: `POST`
   - URI: `https://estatecopilot-api.azurewebsites.net/api/ai-academy/enrol`
   - Headers: `Content-Type: application/json` · `x-enrol-secret: <AI_ACADEMY_ENROL_SECRET>`
   - Body:
     ```json
     {
       "firstName": "<Q1>",
       "lastName": "<Q2>",
       "personalEmail": "<Q3>",
       "phone": "<Q4>",
       "programme": "@{if(equals(<Q5>,'Working professional'),'professional','university')}",
       "organisation": "<Q6>",
       "country": "<Q7>",
       "startMonth": "<Q9>"
     }
     ```
     (`<Qn>` = the "Get response details" dynamic content for that question.)

4. *(optional)* **Condition** on `@{body('HTTP')?['ok']}` = `false` → post the
   `body('HTTP')` report to a Teams channel or email ops, so a partial
   provisioning failure is seen.

---

## Testing before go-live

With `AI_ACADEMY_ENROL_SECRET` set but Graph creds absent, the endpoint runs
in **mock mode** — it logs what it would do and returns a simulated report.
Once the app permissions + IDs are in, submit one real form response and
check: account created, licence shows in the M365 admin center, the person
is in the AI Academy team, a row in the SharePoint list, welcome email
received.
