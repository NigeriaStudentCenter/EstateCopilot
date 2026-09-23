import '../style.css';
import './factcheck.css';
import { leftRailAdsHtml, wireRailAdVideoButtons } from '../railRender';

// Same pattern as students/main.ts: the deployed Azure Function App holds
// the Graph + Anthropic secrets server-side. localhost fallback for dev
// against `func start` (default port 7071), env override for anything else.
const FACT_API_URL: string =
  (import.meta.env.VITE_FACT_API_URL as string | undefined) ||
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:7071/api'
    : 'https://func-rni-newsagent.azurewebsites.net/api');

interface FactCheck {
  id: string;
  headline: string;
  claim: string;
  verdict: string;
  confidence: number | null;
  evidence: string;
  source_url: string;
  source_name: string;
  category: string;
  state: string;
  lga: string;
  claim_date: string | null;
  date_checked: string | null;
}

const VERDICTS = ['True', 'False', 'Misleading', 'Unverifiable', 'Satire', 'Needs Context'] as const;
const VERDICT_CLASS: Record<string, string> = {
  True: 'v-true',
  False: 'v-false',
  Misleading: 'v-misleading',
  Unverifiable: 'v-unverifiable',
  Satire: 'v-satire',
  'Needs Context': 'v-context',
};
const VERDICT_ICON: Record<string, string> = {
  True: '✓',
  False: '✕',
  Misleading: '⚠',
  Unverifiable: '?',
  Satire: '🎭',
  'Needs Context': 'ⓘ',
};

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.round(diffMs / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

const communityRailHtml = `
  <div class="rail-card community-card community-card-compact">
    <p class="community-eyebrow">Nigeria Student Ambassador</p>
    <a class="community-student-tools" href="./">📰 Read Naija Digest — every major Nigerian paper, one feed</a>
    <a class="community-student-tools" href="./students.html">🎓 AI Agents for Students</a>
    <p class="community-links-label">Follow for news updates</p>
    <div class="community-links">
      <a href="https://www.youtube.com/@NigeriaStudentAmbassador" target="_blank" rel="noopener noreferrer">YouTube</a>
      <a href="https://www.facebook.com/JohnAikeremiokha" target="_blank" rel="noopener noreferrer">Facebook</a>
      <a href="https://www.instagram.com/nigeriastudentambassador" target="_blank" rel="noopener noreferrer">Instagram</a>
      <a href="https://www.tiktok.com/@nigeria.student.am" target="_blank" rel="noopener noreferrer">TikTok</a>
    </div>
  </div>`;

async function main() {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div class="layout">
      <aside class="rail rail-left" aria-label="Sponsored">${leftRailAdsHtml()}</aside>
      <div class="page">
        <div class="topbar">
          <div class="logo">Global Nigeria<span class="accent">Student</span>Ambassador</div>
          <div class="topbar-right">
            <a class="student-tools-link" href="./">← Naija Digest</a>
            <div class="badge">Fact Check</div>
          </div>
        </div>

        <h1 class="intro-title">Fact Check</h1>
        <p class="intro-sub">Claims circulating in or about Nigeria, checked against real, cited sources — down to the Local Government Area when a claim is that specific. No verdict here is auto-published: every one is reviewed by a person before it goes live.</p>

        <div class="fc-submit-card">
          <h2>Seen something you're not sure about?</h2>
          <p>Send us the claim — a rumour, a screenshot, a forwarded message — and we'll check it.</p>
          <form id="fc-form">
            <textarea id="fc-claim" placeholder="Paste or describe the claim…" maxlength="2000" required></textarea>
            <div class="fc-form-row">
              <input id="fc-source" type="url" placeholder="Link to where you saw it (optional)" />
              <input id="fc-name" type="text" placeholder="Your name (optional)" maxlength="200" />
            </div>
            <div class="fc-form-row">
              <input id="fc-state" type="text" placeholder="State (optional)" maxlength="100" />
              <input id="fc-lga" type="text" placeholder="LGA (optional)" maxlength="100" />
            </div>
            <button type="submit" id="fc-submit-btn">Submit for fact-checking</button>
            <div class="fc-form-msg" id="fc-form-msg"></div>
          </form>
        </div>

        <div class="desks" id="verdict-filters" role="tablist" aria-label="Filter by verdict"></div>
        <p class="updated" id="fc-status">Loading fact-checks…</p>
        <div class="cards" id="fc-cards"></div>
      </div>
      <aside class="rail rail-right" aria-label="Community">
        ${communityRailHtml}
      </aside>
      <footer class="colophon">
        Fact-checks are AI-assisted and human-reviewed, following the IFCN's non-partisan,
        evidence-based standard. Found an error? Use the form above to flag it.
        <span class="sep">·</span><a href="./">Back to Naija Digest</a>
      </footer>
    </div>`;

  const leftRailEl = document.querySelector<HTMLElement>('.rail-left')!;
  wireRailAdVideoButtons(leftRailEl);

  /* ---------- Submission form ---------- */
  const form = document.getElementById('fc-form') as HTMLFormElement;
  const msgEl = document.getElementById('fc-form-msg')!;
  const submitBtn = document.getElementById('fc-submit-btn') as HTMLButtonElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const claim_text = (document.getElementById('fc-claim') as HTMLTextAreaElement).value.trim();
    if (!claim_text) return;

    submitBtn.disabled = true;
    msgEl.className = 'fc-form-msg';
    msgEl.textContent = 'Sending…';

    try {
      const res = await fetch(`${FACT_API_URL}/factchecks/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_text,
          source_url: (document.getElementById('fc-source') as HTMLInputElement).value.trim(),
          submitted_by: (document.getElementById('fc-name') as HTMLInputElement).value.trim(),
          state: (document.getElementById('fc-state') as HTMLInputElement).value.trim(),
          lga: (document.getElementById('fc-lga') as HTMLInputElement).value.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      msgEl.className = 'fc-form-msg ok';
      msgEl.textContent = "Thanks — we'll check this and publish a verdict soon.";
      form.reset();
    } catch (err) {
      msgEl.className = 'fc-form-msg err';
      msgEl.textContent = 'Could not submit — ' + ((err as Error).message || 'please try again.');
    } finally {
      submitBtn.disabled = false;
    }
  });

  /* ---------- Verdict list ---------- */
  const cardsEl = document.getElementById('fc-cards')!;
  const statusEl = document.getElementById('fc-status')!;
  const filtersEl = document.getElementById('verdict-filters')!;

  let items: FactCheck[] = [];
  let activeVerdict = 'all';

  function renderFilters() {
    const all = [{ id: 'all', label: 'All' }, ...VERDICTS.map((v) => ({ id: v, label: v }))];
    filtersEl.innerHTML = all
      .map(
        (f) => `
        <button class="desk-pill" data-verdict="${f.id}" role="tab" aria-pressed="${f.id === activeVerdict}">
          ${f.label}${f.id !== 'all' ? ` (${items.filter((i) => i.verdict === f.id).length})` : ''}
        </button>`,
      )
      .join('');
    filtersEl.querySelectorAll<HTMLButtonElement>('.desk-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeVerdict = btn.dataset.verdict!;
        renderFilters();
        renderCards();
      });
    });
  }

  function cardHtml(item: FactCheck): string {
    const vClass = VERDICT_CLASS[item.verdict] || 'v-unverifiable';
    const icon = VERDICT_ICON[item.verdict] || '?';
    const where = [item.lga, item.state].filter(Boolean).join(', ');
    return `
      <article class="card fc-card">
        <span class="fc-verdict-badge ${vClass}">${icon} ${escapeHtml(item.verdict)}</span>
        <p class="headline fc-headline">${escapeHtml(item.headline)}</p>
        <p class="summary fc-claim"><strong>Claim:</strong> ${escapeHtml(item.claim)}</p>
        <p class="summary fc-evidence">${escapeHtml(item.evidence)}</p>
        <div class="meta">
          <span class="who">
            ${item.source_url ? `<a href="${item.source_url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source_name || 'Source')}</a>` : escapeHtml(item.source_name || '')}
            ${where ? ` · ${escapeHtml(where)}` : ''}
            ${item.date_checked ? ` · ${relativeTime(item.date_checked)}` : ''}
          </span>
        </div>
      </article>`;
  }

  function renderCards() {
    const filtered = activeVerdict === 'all' ? items : items.filter((i) => i.verdict === activeVerdict);
    if (!filtered.length) {
      cardsEl.innerHTML = `<p class="empty">No fact-checks ${activeVerdict === 'all' ? 'published yet' : `with verdict "${escapeHtml(activeVerdict)}"`} — check back soon.</p>`;
      return;
    }
    cardsEl.innerHTML = filtered.map(cardHtml).join('');
  }

  try {
    const res = await fetch(`${FACT_API_URL}/factchecks`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    items = (await res.json()) as FactCheck[];
    statusEl.textContent = items.length
      ? `${items.length} fact-check${items.length === 1 ? '' : 's'} published`
      : 'No fact-checks published yet — check back soon.';
  } catch {
    statusEl.textContent = "Couldn't load fact-checks right now — please refresh in a moment.";
  }

  renderFilters();
  renderCards();
}

main();
