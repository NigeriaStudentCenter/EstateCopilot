import '../style.css';
import './students.css';
import { leftRailAdsHtml, wireRailAdVideoButtons } from '../railRender';
import { mountChat } from '../chat';
import { mountLiveRoom } from '../liveRoom';

// The proxy that holds the API key (see /student-agents-api). Same pattern
// as chat.ts: a hard-coded prod URL with a localhost fallback for dev, and
// an env override for anything else.
const AGENTS_API_URL: string =
  (import.meta.env.VITE_AGENTS_API_URL as string | undefined) ||
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:4002'
    : 'https://student-agents-api.azurewebsites.net');

type Tier = 'smart' | 'fast';

interface AgentMessage {
  role: 'user';
  content: string | unknown[];
}

async function callAgent(tier: Tier, messages: AgentMessage[], web: boolean): Promise<string> {
  const res = await fetch(`${AGENTS_API_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, messages, web }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return (data.text || '').trim();
}

/* ---------- Attach an uploaded brief (PDF / image / text) ---------- */
function readFileBlock(file: File): Promise<unknown | null> {
  return new Promise((resolve) => {
    const name = file.name.toLowerCase();
    const r = new FileReader();
    if (name.match(/\.txt$/)) {
      r.onload = () => resolve({ type: 'text', text: 'ASSESSMENT BRIEF (uploaded): ' + r.result });
      r.readAsText(file);
      return;
    }
    const isPdf = name.match(/\.pdf$/);
    const isImg = name.match(/\.(png|jpe?g|webp|gif)$/);
    if (!isPdf && !isImg) {
      resolve(null);
      return;
    }
    r.onload = () => {
      const b64 = ('' + r.result).split(',')[1];
      if (isPdf) {
        resolve({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
      } else {
        const mt = name.match(/\.png$/)
          ? 'image/png'
          : name.match(/\.webp$/)
            ? 'image/webp'
            : name.match(/\.gif$/)
              ? 'image/gif'
              : 'image/jpeg';
        resolve({ type: 'image', source: { type: 'base64', media_type: mt, data: b64 } });
      }
    };
    r.readAsDataURL(file);
  });
}

/* ---------- Field + worker definitions ---------- */
interface Field {
  id: string;
  label: string;
  type: 'text' | 'select' | 'textarea' | 'file';
  ph?: string;
  opts?: string[];
}
interface Worker {
  id: string;
  nm: string;
  ds: string;
  tier: Tier;
  web: boolean;
  note?: string;
  fields: Field[];
  prompt: (f: Record<string, string>) => string;
}

const WORKERS: Worker[] = [
  {
    id: 'research',
    nm: 'Academic Study Companion',
    ds: 'Plan, research, learn, improve',
    tier: 'smart',
    web: true,
    note: 'A study aid to help you learn, plan and improve — it never writes the assignment for you (that is academic misconduct and can fail you). Run each mode for depth, verify every source, and write in your own words.',
    fields: [
      { id: 'topic', label: 'Topic, question or module', type: 'text', ph: 'e.g. Features contributing to the success of contrasting businesses' },
      { id: 'level', label: 'Level', type: 'select', opts: ['GCSE', 'A-Level / BTEC', 'College / Sixth-form', 'Undergraduate (BSc/BA)', 'Masters', 'PhD'] },
      { id: 'style', label: 'Reference style', type: 'select', opts: ['Harvard', 'APA', 'MLA', 'Chicago', 'IEEE', 'Vancouver'] },
      { id: 'mode', label: 'What do you need?', type: 'select', opts: ['Detailed plan mapped to the brief', 'Research & real sources', 'Explain the key concepts', 'Model example paragraph (to learn from)', 'Review my draft (feedback)', 'Full study pack (overview)'] },
      { id: 'draft', label: 'Paste your own draft (only for "Review my draft")', type: 'textarea', ph: 'Paste what you have written so far...' },
      { id: 'brief', label: 'Upload assessment brief (optional) — PDF, image or .txt', type: 'file' },
    ],
    prompt: (f) =>
      `You are an expert academic study companion and tutor. Help the student LEARN and produce excellent work THEMSELVES - never write a finished, submittable assignment for them. Level: ${f.level}. Topic or module: ${f.topic}. Reference style: ${f.style}. Requested: ${f.mode}. If an assessment brief is attached, read it carefully and map everything to its exact tasks, learning aims and assessment or marking criteria (name each criterion). Adapt depth to the level: GCSE, A-Level and BTEC = clear and criteria-focused; Undergraduate = solid academic rigour; Masters = critical analysis and evaluation; PhD = rigorous, original-contribution framing with a systematic approach to the literature. Then, based on the requested mode: DETAILED PLAN = a thorough brief-mapped plan covering every task or section, what to cover, structure, word-count guidance and the criteria each part meets. RESEARCH AND REAL SOURCES = 6 to 10 real sources found via web search with working links, each with a note on what it gives you, plus key facts and data with citations. EXPLAIN THE KEY CONCEPTS = teach the core ideas with clear explanations and examples so the student can write knowledgeably. MODEL EXAMPLE PARAGRAPH = ONE well-written example paragraph at the right level, clearly labelled EXAMPLE - now write your own in your own words, then 3 tips. REVIEW MY DRAFT = read the student draft below and give specific constructive feedback (strengths, gaps against the brief or criteria, structure, argument, evidence, referencing) and a checklist to raise the grade - do NOT rewrite it for them. FULL STUDY PACK = a condensed version of all of the above together. Always use web search to ground sources and facts in REAL, current material - never invent sources, links, quotes or data. Provide a bibliography in ${f.style} style with working URLs. Student draft if any: ${f.draft || '(none provided)'}. End with a short academic-integrity reminder: this is a study aid; write everything in your own words; submitting AI-written work as your own is academic misconduct.`,
  },
  {
    id: 'scholar',
    nm: 'Scholarship Finder',
    ds: 'Live scholarships + links',
    tier: 'fast',
    web: true,
    note: 'Deadlines and eligibility change — always confirm on the official site. Never pay a fee to apply; genuine scholarships do not charge one.',
    fields: [
      { id: 'where', label: 'Country / region / state', type: 'text', ph: 'e.g. Ontario, Canada  or  Lagos, Nigeria' },
      { id: 'level', label: 'Level of study', type: 'select', opts: ['Undergraduate', 'Masters', 'PhD', 'College / Sixth-form', 'Vocational'] },
      { id: 'field', label: 'Field of study', type: 'text', ph: 'e.g. Nursing, Engineering, Law' },
      { id: 'who', label: 'Your nationality / eligibility (optional)', type: 'text', ph: 'e.g. Nigerian national, first-generation student' },
      { id: 'cover', label: 'Coverage', type: 'select', opts: ['Any', 'Full (fully funded)', 'Partial'] },
    ],
    prompt: (f) =>
      `You are a scholarships adviser. Use web search to find CURRENT, real scholarships that match: location ${f.where}; level ${f.level}; field ${f.field}; eligibility ${f.who || 'any'}; coverage ${f.cover}. Return up to 6 scholarships. For each: name; provider; what it covers (full or partial plus details); key eligibility; deadline; and the OFFICIAL application link (URL). Prefer official government, university and reputable foundation sources. Only list scholarships you actually found via search with a real link — do not invent any. End with a one-line safety note: verify details on the official site and never pay to apply.`,
  },
  {
    id: 'jobs',
    nm: 'Student Jobs Finder',
    ds: 'Local jobs, any country',
    tier: 'fast',
    web: true,
    note: 'Listings change fast — apply via official sites and beware scams (never pay for a job or share bank details early). If on a student visa, check your allowed working hours.',
    fields: [
      { id: 'loc', label: 'Location (country, region/state, city)', type: 'text', ph: 'e.g. Manchester, England  or  Austin, Texas, USA' },
      { id: 'kind', label: 'Type of work', type: 'select', opts: ['Any', 'Odd jobs / gigs', 'Weekend', 'Vacation / seasonal', 'Part-time (term-time)', 'Permanent / graduate'] },
      { id: 'skills', label: 'Type of work or skills (optional)', type: 'text', ph: 'e.g. tutoring, retail, hospitality, coding' },
    ],
    prompt: (f) =>
      `You are a student jobs assistant. Use web search for CURRENT student-friendly work in: ${f.loc}. Type: ${f.kind}. Skills or interest: ${f.skills || 'any'}. Return: (1) a few specific current openings if you find them (title, employer, location, link); (2) the top 3-4 best local or relevant job boards or sources to search for this location, each with a link; (3) 2-3 quick tips for a student applying. Only include real links you found via search. End with a one-line safety note about avoiding job scams.`,
  },
  {
    id: 'gigs',
    nm: 'Social & Gigs Finder',
    ds: 'Events near you, with dates',
    tier: 'fast',
    web: true,
    note: 'Event details change — always confirm the date, time and venue on the official link. Some events are 18+ or ticketed.',
    fields: [
      { id: 'loc', label: 'Location (country, region/state, city)', type: 'text', ph: 'e.g. Leeds, England  or  Accra, Ghana' },
      { id: 'kind', label: 'Type of event', type: 'select', opts: ['Any', 'Live music / gigs', 'Student socials & club nights', 'Meetups & networking', 'Festivals', 'Free events', 'Sports & fitness socials'] },
      { id: 'when', label: 'When', type: 'select', opts: ['This weekend', 'This week', 'This month', 'Any upcoming'] },
    ],
    prompt: (f) =>
      `You are a student social-life assistant. Use web search to find CURRENT, upcoming social events and gigs relevant to students in: ${f.loc}. Type: ${f.kind}. Timeframe: ${f.when}. Return up to 6 real events. For EACH give: event name; type; DATE; START TIME; VENUE and area/city; a one-line description; and a link (official page, ticket site or listing). Prefer real listings (Eventbrite, local venues, university student unions, Meetup, ticket sites). Only include real events you actually found via search — never invent events, dates or links. End with a one-line note to confirm details on the official link.`,
  },
  {
    id: 'accom',
    nm: 'Accommodation Finder',
    ds: 'Student housing, anywhere',
    tier: 'fast',
    web: true,
    note: 'Prices and availability change — confirm on the official link. Beware rental scams: never pay a deposit before viewing or verifying the landlord or platform.',
    fields: [
      { id: 'loc', label: 'Where? (country, state/region, town/city)', type: 'text', ph: 'e.g. Coventry, England  or  Kumasi, Ghana' },
      { id: 'type', label: 'Type of accommodation', type: 'select', opts: ['Any', 'University halls', 'Private student halls', 'Shared house / flat', 'Studio', 'Room in a family home (homestay)', 'Short-term / temporary'] },
      { id: 'budget', label: 'Budget per month (optional)', type: 'text', ph: 'e.g. £600, or $500' },
      { id: 'when', label: 'Move-in / term (optional)', type: 'text', ph: 'e.g. September 2026' },
    ],
    prompt: (f) =>
      `You are a student accommodation assistant. Use web search to find CURRENT student housing options in: ${f.loc}. Type: ${f.type}. Budget: ${f.budget || 'any'}. Move-in: ${f.when || 'flexible'}. Return up to 6 real options. For EACH give: name or provider; type; area and rough distance to universities; approximate rent and whether bills are included; a key feature or two; and a link (official provider, university accommodation page or reputable listing site). Prefer reputable sources (university accommodation offices, Unite Students, student.com, local letting agents, established listing sites). Only include real options you found via search — never invent listings, prices or links. End with a one-line safety note about avoiding rental scams (never pay before viewing or verifying).`,
  },
];

/* ---------- Helpers ---------- */
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Turn URLs in the model's answer into real clickable links. Handles both
// markdown "[label](url)" and bare "https://…" (the model uses both), and
// trims trailing punctuation that isn't part of the address.
function linkify(text: string): string {
  const A = (url: string, label: string) => {
    let clean = url;
    if (clean.endsWith('&gt;')) clean = clean.slice(0, -4);
    const punct = clean.match(/[.,;:!?)\]}]+$/);
    if (punct) clean = clean.slice(0, -punct[0].length);
    const trail = url.slice(clean.length);
    const text = label && label !== url ? label : clean;
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${text}</a>${trail}`;
  };
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => A(url, label))
    .replace(/(^|[\s(])(https?:\/\/[^\s<)\]]+)/g, (_m, pre, url) => pre + A(url, ''));
}

/* ---------- Render ---------- */
const communityRailHtml = `
  <div class="rail-card community-card community-card-compact">
    <p class="community-eyebrow">Nigeria Student Ambassador</p>
    <a class="community-student-tools" href="./">📰 Read Naija Digest — every major Nigerian paper, one feed</a>
    <a class="community-ambassador" href="https://forms.office.com/Pages/ResponsePage.aspx?id=iBFpdp2b7ke7Wir-xS9NXloJuLeFjWtAiMlqr2n6TRRUMDcyU1BPVVpGNzNCOFlPUjI5TEk1UFpaMC4u" target="_blank" rel="noopener noreferrer">📍 Get news from your home LGA<span>Register your Local Government Area — it's free</span></a>
    <p class="community-links-label">Follow for news updates</p>
    <div class="community-links">
      <a href="https://www.youtube.com/@NigeriaStudentAmbassador" target="_blank" rel="noopener noreferrer">YouTube</a>
      <a href="https://www.facebook.com/JohnAikeremiokha" target="_blank" rel="noopener noreferrer">Facebook</a>
      <a href="https://www.instagram.com/nigeriastudentambassador" target="_blank" rel="noopener noreferrer">Instagram</a>
      <a href="https://www.tiktok.com/@nigeria.student.am" target="_blank" rel="noopener noreferrer">TikTok</a>
    </div>
  </div>`;

function main() {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div class="layout">
      <aside class="rail rail-left" aria-label="Sponsored">${leftRailAdsHtml()}</aside>
      <div class="page">
        <div class="topbar">
          <div class="logo">Global Nigeria<span class="accent">Student</span>Ambassador</div>
          <div class="topbar-right">
            <a class="student-tools-link" href="./">← Naija Digest</a>
            <div class="badge">AI Agents for Students</div>
          </div>
        </div>

        <h1 class="intro-title">AI Agents for Students</h1>
        <p class="intro-sub">Five assistants for the things students actually spend time on — studying well, finding scholarships, work, housing and events. Answers are AI-generated: always check sources, deadlines and prices on the official site.</p>
        <p class="mobile-hint">📱 On a phone the tools come first — scroll down for the live room, chat and videos.</p>

        <div class="keybar">
          <span class="keydot on"></span>
          <span class="grow">Powered by Nigeria Student AI Agent.</span>
        </div>

        <div class="tabs" id="tabs" role="tablist" aria-label="Student tools"></div>
        <div class="panelhead"><h2 id="wt"></h2><p id="wd"></p></div>
        <div id="dyn"></div>
      </div>
      <aside class="rail rail-right" aria-label="Community">
        <div id="live-room-mount"></div>
        <div id="chat-mount"></div>
        ${communityRailHtml}
      </aside>
      <footer class="colophon">
        A tool for the <a href="https://nigeriastudentambassador.com">Nigeria Student Ambassador</a> community.
        <span class="sep">·</span><a href="./">Back to Naija Digest</a>
      </footer>
    </div>`;

  const leftRailEl = document.querySelector<HTMLElement>('.rail-left')!;
  wireRailAdVideoButtons(leftRailEl);

  // Unlike the news page, the Student Tools rails show on every viewport —
  // stacked below the tools on mobile (see students.css) — so the live
  // room and chat mount once on load rather than being gated to desktop.
  // The live room here is the "students" room: a separate LiveKit room
  // from the news page's, with its own host/live state.
  mountLiveRoom(document.getElementById('live-room-mount')!, { room: 'students' });
  mountChat(document.getElementById('chat-mount')!, { channel: 'students', title: 'Student Chat' });

  const tabsEl = document.getElementById('tabs')!;
  WORKERS.forEach((w) => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.type = 'button';
    b.dataset.id = w.id;
    b.setAttribute('role', 'tab');
    b.textContent = w.nm;
    b.addEventListener('click', () => select(w.id));
    tabsEl.appendChild(b);
  });

  let current: Worker;

  function select(id: string) {
    current = WORKERS.find((w) => w.id === id)!;
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((e) => {
      e.setAttribute('aria-pressed', String(e.dataset.id === id));
    });
    $('#wt')!.textContent = current.nm;
    $('#wd')!.textContent = current.ds;

    const fieldsHtml = current.fields
      .map((fl) => {
        if (fl.type === 'select') {
          return `<div><label>${fl.label}</label><select id="f_${fl.id}">${(fl.opts || [])
            .map((o) => `<option>${o}</option>`)
            .join('')}</select></div>`;
        }
        if (fl.type === 'file') {
          return `<div><label>${fl.label}</label><input type="file" id="f_${fl.id}" accept=".pdf,.png,.jpg,.jpeg,.txt" style="padding:8px"></div>`;
        }
        if (fl.type === 'textarea') {
          return `<div><label>${fl.label}</label><textarea id="f_${fl.id}" placeholder="${fl.ph || ''}"></textarea></div>`;
        }
        return `<div><label>${fl.label}</label><input id="f_${fl.id}" placeholder="${fl.ph || ''}"></div>`;
      })
      .join('');

    $('#dyn')!.innerHTML = `
      <div class="tools-card">
        <div class="fields">${fieldsHtml}</div>
        <button class="run" id="run">Run ${escapeHtml(current.nm)}</button>
        <div class="err" id="err"></div>
        <div class="load" id="load"><div class="spin"></div>Working… web searches can take 20–40 seconds.</div>
        <button class="copy" id="copy">Copy</button>
        <div class="out" id="out"></div>
      </div>
      ${current.note ? `<p class="note">${current.note}</p>` : ''}`;

    $('#run')!.addEventListener('click', runWorker);
    $('#copy')!.addEventListener('click', () => {
      navigator.clipboard.writeText($('#out')!.textContent || '');
      $('#copy')!.textContent = 'Copied ✓';
      setTimeout(() => {
        $('#copy')!.textContent = 'Copy';
      }, 1200);
    });
  }

  async function runWorker() {
    const f: Record<string, string> = {};
    current.fields.forEach((fl) => {
      f[fl.id] = ($(`#f_${fl.id}`) as HTMLInputElement | null)?.value || '';
    });

    const err = $('#err')!;
    const out = $('#out')!;
    const load = $('#load')!;
    const copy = $('#copy')!;
    const run = $('#run') as HTMLButtonElement;

    err.style.display = 'none';
    out.style.display = 'none';
    copy.style.display = 'none';
    load.style.display = 'block';
    run.disabled = true;

    try {
      let promptText = current.prompt(f);
      if (current.web) {
        // The results panel turns URLs into clickable links — so make the
        // model always surface the real address, not "see the link below".
        promptText +=
          '\n\nLINKS: give every source, scholarship, listing or event a real, working URL written out in full (https://…), either on its own or as [short label](https://…). Never refer to a link without including its address.';
      }
      let content: string | unknown[] = promptText;
      const fileField = current.fields.find((x) => x.type === 'file');
      if (fileField) {
        const el = $(`#f_${fileField.id}`) as HTMLInputElement | null;
        if (el && el.files && el.files[0]) {
          const blk = await readFileBlock(el.files[0]);
          if (blk) content = [blk, { type: 'text', text: content }];
        }
      }
      const text = await callAgent(current.tier, [{ role: 'user', content }], current.web);
      if (!text) throw new Error('The model returned an empty response — please try again.');
      out.innerHTML = linkify(text);
      out.style.display = 'block';
      copy.style.display = 'block';
    } catch (e) {
      err.textContent = 'Could not get a result — ' + ((e as Error).message || 'try again.');
      err.style.display = 'block';
    } finally {
      load.style.display = 'none';
      run.disabled = false;
    }
  }

  select('research');
}

main();
