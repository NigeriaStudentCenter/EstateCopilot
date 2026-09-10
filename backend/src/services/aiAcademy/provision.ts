// AI Academy on Wheels — learner provisioning.
//
// Two intake paths, same Microsoft 365 work:
//
//  A. Power Automate flow (no premium): the "AI Academy on Wheels — Enrolment"
//     Microsoft Form -> Forms "Get response details" -> SharePoint "Create
//     item" into the "AI Academy Enrolments" list with Status blank/"New".
//     runEnrolmentPoll() (services/aiAcademy/poller.ts, on a timer) picks up
//     those rows, provisions, and writes the outcome back to the row.
//
//  B. HTTP: POST /api/ai-academy/enrol (needs the premium HTTP action, or a
//     direct caller) -> enrolLearner(), which also creates the SharePoint row.
//
// The M365 side, via app-only Graph (same client-credentials pattern as
// services/sharepoint.ts, same tenant):
//
//   1. create the learner's account   (first.last@<domain>)
//   2. assign the student licence      (Microsoft 365 A1 for students)
//   3. add them to the "AI Academy" team/group
//   4. email them their sign-in details + class link
//
// Every step is independent and best-effort: one failure does not abort the
// rest, and nothing here throws — callers get a per-step report.

import crypto from 'node:crypto';
import { env } from '../../config/env.js';

export interface EnrolInput {
  firstName: string;
  lastName: string;
  personalEmail: string;
  phone?: string;
  programme: 'university' | 'professional';
  organisation?: string; // university name, or employer + role
  country?: string; // free text from the form; mapped to a usageLocation
  startMonth?: string;
}

type StepResult = 'ok' | 'skipped' | `error: ${string}`;
export interface EnrolReport {
  ok: boolean;
  mock: boolean;
  upn?: string;
  tempPassword?: string; // present only in mock mode / returned to the flow once
  steps: {
    createUser: StepResult;
    assignLicence: StepResult;
    addToTeam: StepResult;
    welcomeEmail: StepResult;
    sharePointRow?: StepResult; // only on the HTTP path (path B)
  };
}

function reportNote(r: EnrolReport): string {
  return (
    `user:${r.steps.createUser} · licence:${r.steps.assignLicence} · ` +
    `team:${r.steps.addToTeam} · email:${r.steps.welcomeEmail}`
  );
}

const cfg = () => env.aiAcademyEnrol;

function graphConfigured(): boolean {
  const c = cfg();
  return !!(c.tenantId && c.clientId && c.clientSecret);
}

// ---- Graph plumbing -------------------------------------------------

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  const c = cfg();
  if (!graphConfigured()) return null;
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;

  const res = await fetch(`https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: c.clientId!,
      client_secret: c.clientSecret!,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) {
    console.error('[ai-academy] token request failed', res.status, await res.text().catch(() => ''));
    return null;
  }
  const b = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: b.access_token, expiresAt: Date.now() + b.expires_in * 1000 };
  return token.value;
}

async function graph(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const t = await getToken();
  if (!t) return { ok: false, status: 0, json: null, text: 'no token' };
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, json, text };
}

// ---- helpers ------------------------------------------------------

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

function usageLocation(country?: string): string {
  const c = (country ?? '').trim().toLowerCase();
  if (!c || c.includes('nigeria')) return 'NG';
  if (c.includes('united kingdom') || c === 'uk' || c === 'gb' || c.includes('britain')) return 'GB';
  if (c.includes('united states') || c === 'usa' || c === 'us') return 'US';
  if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
  return 'NG';
}

function tempPassword(): string {
  // 4 blocks of base32-ish + a fixed symbol/number so it meets complexity.
  const raw = crypto.randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}9!`;
}

let siteIdCache: string | null = null;
async function resolveSiteId(): Promise<string | null> {
  if (siteIdCache) return siteIdCache;
  const path = cfg().sitePath; // e.g. "bsoed.sharepoint.com:/sites/AIAcademy"
  const r = await graph('GET', `/sites/${path}`);
  if (!r.ok || !r.json?.id) {
    console.error('[ai-academy] resolve site failed', r.status, r.text);
    return null;
  }
  siteIdCache = r.json.id as string;
  return siteIdCache;
}

let listIdCache: string | null = null;
async function resolveListId(siteId: string): Promise<string | null> {
  if (cfg().listId) return cfg().listId!;
  if (listIdCache) return listIdCache;
  const name = encodeURIComponent(cfg().listName);
  const r = await graph('GET', `/sites/${siteId}/lists?$filter=displayName eq '${name}'&$select=id,displayName`);
  const found = r.json?.value?.[0]?.id as string | undefined;
  if (found) {
    listIdCache = found;
    return found;
  }
  // Create it once. The Power Automate "Create item" step fills the intake
  // columns (Title holds the full name); the poller writes Status/AccountUPN/
  // ProvisionNote/EnrolledAt back.
  const created = await graph('POST', `/sites/${siteId}/lists`, {
    displayName: cfg().listName,
    columns: [
      { name: 'FirstName', text: {} },
      { name: 'LastName', text: {} },
      { name: 'Email', text: {} },
      { name: 'Programme', text: {} },
      { name: 'Organisation', text: {} },
      { name: 'Country', text: {} },
      { name: 'Phone', text: {} },
      { name: 'StartMonth', text: {} },
      { name: 'Status', text: {} },
      { name: 'AccountUPN', text: {} },
      { name: 'ProvisionNote', text: {} },
      { name: 'EnrolledAt', text: {} },
    ],
    list: { template: 'genericList' },
  });
  if (created.ok && created.json?.id) {
    listIdCache = created.json.id as string;
    return listIdCache;
  }
  console.error('[ai-academy] resolve/create list failed', created.status, created.text);
  return null;
}

// ---- the provisioning steps ------------------------------------

async function pickUpn(first: string, last: string): Promise<string> {
  const domain = cfg().accountDomain;
  const base = `${slug(first)}.${slug(last)}`;
  for (let i = 0; i < 6; i++) {
    const candidate = `${base}${i === 0 ? '' : i + 1}@${domain}`;
    const r = await graph('GET', `/users/${encodeURIComponent(candidate)}?$select=id`);
    if (r.status === 404) return candidate; // free
    if (!r.ok) break; // transient — take the candidate and let create surface the real error
  }
  return `${base}${Date.now().toString().slice(-4)}@${domain}`;
}

// ---- the Microsoft 365 work (both paths) --------------------

async function provisionM365(input: EnrolInput): Promise<EnrolReport> {
  const report: EnrolReport = {
    ok: false,
    mock: !graphConfigured(),
    steps: { createUser: 'skipped', assignLicence: 'skipped', addToTeam: 'skipped', welcomeEmail: 'skipped' },
  };

  const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  const pwd = tempPassword();

  if (report.mock) {
    const upn = `${slug(input.firstName)}.${slug(input.lastName)}@${cfg().accountDomain}`;
    console.log(`[ai-academy:mock] would enrol ${displayName} <${input.personalEmail}> as ${upn} (${input.programme})`);
    return {
      ...report,
      ok: true,
      upn,
      tempPassword: pwd,
      steps: {
        createUser: 'ok',
        assignLicence: cfg().licenseSkuId ? 'ok' : 'skipped',
        addToTeam: cfg().teamGroupId ? 'ok' : 'skipped',
        welcomeEmail: cfg().welcomeFrom ? 'ok' : 'skipped',
      },
    };
  }

  // 1. create the account
  const upn = await pickUpn(input.firstName, input.lastName);
  report.upn = upn;
  const create = await graph('POST', '/users', {
    accountEnabled: true,
    displayName,
    givenName: input.firstName.trim(),
    surname: input.lastName.trim(),
    mailNickname: upn.split('@')[0],
    userPrincipalName: upn,
    usageLocation: usageLocation(input.country),
    passwordProfile: { forceChangePasswordNextSignIn: true, password: pwd },
  });
  if (!create.ok || !create.json?.id) {
    report.steps.createUser = `error: ${create.status} ${create.text.slice(0, 300)}`;
    return report; // nothing else can proceed without the user id
  }
  report.steps.createUser = 'ok';
  const userId = create.json.id as string;

  // 2. assign the student licence
  if (cfg().licenseSkuId) {
    const lic = await graph('POST', `/users/${userId}/assignLicense`, {
      addLicenses: [{ skuId: cfg().licenseSkuId }],
      removeLicenses: [],
    });
    report.steps.assignLicence = lic.ok ? 'ok' : `error: ${lic.status} ${lic.text.slice(0, 200)}`;
  }

  // 3. add to the AI Academy team/group
  if (cfg().teamGroupId) {
    const add = await graph('POST', `/groups/${cfg().teamGroupId}/members/$ref`, {
      '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    });
    report.steps.addToTeam =
      add.ok || /already exist/i.test(add.text) ? 'ok' : `error: ${add.status} ${add.text.slice(0, 200)}`;
  }

  // 4. welcome email
  const from = cfg().welcomeFrom;
  if (from) {
    const mail = await graph('POST', `/users/${encodeURIComponent(from)}/sendMail`, {
      message: {
        subject: 'Welcome to AI Academy on Wheels',
        body: {
          contentType: 'Text',
          content:
            `Hi ${input.firstName},\n\n` +
            `You're enrolled on AI Academy on Wheels.\n\n` +
            `Your AI Academy sign-in:\n` +
            `  Username: ${upn}\n` +
            `  Temporary password: ${pwd}\n` +
            `  (you'll be asked to set your own password on first sign-in at https://portal.office.com)\n\n` +
            `Classes run live online every Friday, 7:00–8:00 pm West Africa Time. ` +
            `Your class link and materials are in the "AI Academy" team in Microsoft Teams — ` +
            `sign in with the details above and you'll find it there.\n\n` +
            `It's a monthly subscription (₦20,000 / £10) with no fixed term — you can stop any time.\n\n` +
            `See you Friday,\nAI Academy`,
        },
        toRecipients: [{ emailAddress: { address: input.personalEmail } }],
      },
      saveToSentItems: true,
    });
    report.steps.welcomeEmail = mail.ok ? 'ok' : `error: ${mail.status} ${mail.text.slice(0, 200)}`;
  }

  report.ok = report.steps.createUser === 'ok';
  return report;
}

// ---- path B: HTTP endpoint (also creates the SharePoint row) ----

export async function enrolLearner(input: EnrolInput): Promise<EnrolReport> {
  const report = await provisionM365(input);

  const siteId = await resolveSiteId();
  const listId = siteId ? await resolveListId(siteId) : null;
  if (siteId && listId) {
    const row = await graph('POST', `/sites/${siteId}/lists/${listId}/items`, {
      fields: {
        Title: `${input.firstName} ${input.lastName}`.trim(),
        FirstName: input.firstName,
        LastName: input.lastName,
        Email: input.personalEmail,
        Programme: input.programme,
        Organisation: input.organisation ?? '',
        Country: input.country ?? '',
        Phone: input.phone ?? '',
        StartMonth: input.startMonth ?? '',
        Status: report.ok ? 'Active' : 'Failed',
        AccountUPN: report.upn ?? '',
        ProvisionNote: reportNote(report),
        EnrolledAt: new Date().toISOString(),
      },
    });
    report.steps.sharePointRow = row.ok ? 'ok' : `error: ${row.status} ${row.text.slice(0, 200)}`;
  } else if (!report.mock) {
    report.steps.sharePointRow = 'error: site or list unresolved';
  }
  return report;
}

// ---- path A: poll the SharePoint list for new enrolments -------

const inFlight = new Set<string>();

function normProgramme(raw?: string): 'university' | 'professional' {
  return /prof|work|employ|staff/i.test(raw ?? '') ? 'professional' : 'university';
}

function rowToInput(f: Record<string, any>): EnrolInput | null {
  const email = String(f.Email ?? f.email ?? '').trim();
  if (!email) return null;
  let first = String(f.FirstName ?? f.firstName ?? '').trim();
  let last = String(f.LastName ?? f.lastName ?? '').trim();
  if (!first) {
    const parts = String(f.Title ?? '').trim().split(/\s+/);
    first = parts[0] ?? '';
    last = last || parts.slice(1).join(' ');
  }
  if (!first) return null;
  return {
    firstName: first,
    lastName: last || first,
    personalEmail: email,
    phone: String(f.Phone ?? '').trim() || undefined,
    programme: normProgramme(f.Programme ?? f['I am a…'] ?? f.IAmA),
    organisation: String(f.Organisation ?? '').trim() || undefined,
    country: String(f.Country ?? '').trim() || undefined,
    startMonth: String(f.StartMonth ?? '').trim() || undefined,
  };
}

// One pass: provision every list row that has no Status yet (or Status "New").
export async function runEnrolmentPoll(): Promise<{ scanned: number; provisioned: number } | null> {
  if (!graphConfigured()) return null;
  const siteId = await resolveSiteId();
  const listId = siteId ? await resolveListId(siteId) : null;
  if (!siteId || !listId) return null;

  const list = await graph(
    'GET',
    `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=50&$orderby=lastModifiedDateTime desc`,
  );
  const items: any[] = list.json?.value ?? [];
  let provisioned = 0;

  for (const item of items) {
    const id = String(item.id);
    const f = item.fields ?? {};
    const status = String(f.Status ?? '').trim().toLowerCase();
    if (status && status !== 'new') continue; // already handled
    if (inFlight.has(id)) continue;
    const input = rowToInput(f);
    if (!input) continue;

    inFlight.add(id);
    try {
      // Claim the row so an overlapping tick / instance skips it.
      await graph('PATCH', `/sites/${siteId}/lists/${listId}/items/${id}/fields`, { Status: 'Processing' });
      const report = await provisionM365(input);
      await graph('PATCH', `/sites/${siteId}/lists/${listId}/items/${id}/fields`, {
        Status: report.ok ? 'Active' : 'Failed',
        AccountUPN: report.upn ?? '',
        ProvisionNote: reportNote(report),
        EnrolledAt: new Date().toISOString(),
      });
      if (report.ok) provisioned++;
      console.log(`[ai-academy:poll] ${input.personalEmail} -> ${report.upn ?? '?'} (${report.ok ? 'Active' : 'Failed'})`);
    } catch (err) {
      console.error('[ai-academy:poll] row failed', id, err);
      await graph('PATCH', `/sites/${siteId}/lists/${listId}/items/${id}/fields`, {
        Status: 'Failed',
        ProvisionNote: `poll error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 250),
      }).catch(() => {});
    } finally {
      inFlight.delete(id);
    }
  }
  return { scanned: items.length, provisioned };
}
