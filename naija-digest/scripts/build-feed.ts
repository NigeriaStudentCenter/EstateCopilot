// Fetches every source in sources.ts, buckets each item into one or more
// desks, and writes src/feed.json for the static page to load at runtime.
// Run on a schedule by .github/workflows/deploy-naija-digest.yml — never on
// request from the page itself, so a reader never triggers a live fetch of
// someone else's RSS feed.
import Parser from 'rss-parser';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, KEYWORD_DESKS, DESKS } from './sources.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(dirname, '../src/feed.json');
// Capped per desk, not globally — a high-volume single source (Jobzilla
// posts roughly 80+ jobs/hour) would otherwise fill the entire feed within
// a couple of hours and crowd out every other desk under one shared cap.
const MAX_ITEMS_PER_DESK = 60;

interface FeedItem {
  id: string;
  desks: string[];
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt: string;
}

const parser = new Parser({ timeout: 10_000 });

function truncate(text: string, max = 200): string {
  const clean = text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    // Some outlets' RSS snippets append their own "Read More: <url>" or a
    // trailing bare link — that's boilerplate, not summary, and the
    // headline already links out, so drop it rather than truncate mid-URL.
    .replace(/\s*Read More:?\s*https?:\/\/\S*$/i, '')
    .replace(/\s*https?:\/\/\S+$/, '')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// Small, deterministic id from the article URL — good enough to dedupe and
// to key the "Saved" localStorage set client-side, no crypto needed.
function hashId(link: string): string {
  let hash = 0;
  for (let i = 0; i < link.length; i++) {
    hash = (hash * 31 + link.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// rss-parser's own `timeout` option is supposed to bound each request, but
// a run on 2026-08-26 hung for 10+ minutes on this step in CI regardless —
// almost certainly a source whose response headers arrive fine but whose
// body then stalls mid-stream, which a connect/response timeout doesn't
// always catch. This wraps the ENTIRE fetch in a hard wall-clock deadline
// so no single source can ever hang the whole build again, regardless of
// what the underlying HTTP client actually does.
const HARD_TIMEOUT_MS = 20_000;

function withHardTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`hard timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  }).catch((err) => {
    throw new Error(`${label}: ${err.message}`);
  });
}

async function fetchSource(source: (typeof SOURCES)[number]): Promise<FeedItem[]> {
  const feed = await withHardTimeout(parser.parseURL(source.feedUrl), HARD_TIMEOUT_MS, source.name);
  const items: FeedItem[] = [];
  for (const entry of feed.items ?? []) {
    if (!entry.link || !entry.title) continue;
    const haystack = `${entry.title} ${entry.contentSnippet ?? ''}`.toLowerCase();
    const desks = new Set<string>([source.desk]);
    for (const rule of source.crossTag === false ? [] : KEYWORD_DESKS) {
      if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
        desks.add(rule.desk);
      }
    }
    items.push({
      id: hashId(entry.link),
      desks: [...desks],
      title: entry.title.trim(),
      summary: truncate(entry.contentSnippet ?? entry.content ?? ''),
      link: entry.link,
      source: source.name,
      publishedAt: entry.isoDate ?? new Date().toISOString(),
    });
  }
  return items;
}

async function buildFeed() {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));

  const items: FeedItem[] = [];
  results.forEach((result, i) => {
    const source = SOURCES[i];
    if (result.status === 'fulfilled') {
      items.push(...result.value);
      console.log(`${source.name}: ${result.value.length} items`);
    } else {
      console.error(`${source.name}: skipped — ${result.reason?.message ?? result.reason}`);
    }
  });

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Take the top MAX_ITEMS_PER_DESK per desk, then union by id (already
  // recency-sorted) — an item tagged into two desks only ever appears once
  // in the output, but no single desk can starve another of space.
  const selected = new Map<string, FeedItem>();
  for (const desk of DESKS) {
    let count = 0;
    for (const item of items) {
      if (count >= MAX_ITEMS_PER_DESK) break;
      if (item.desks.includes(desk.id)) {
        selected.set(item.id, item);
        count++;
      }
    }
  }
  const trimmed = items.filter((item) => selected.has(item.id));

  const feed = {
    generatedAt: new Date().toISOString(),
    items: trimmed,
  };

  writeFileSync(OUT_PATH, JSON.stringify(feed, null, 2));
  console.log(`\nWrote ${trimmed.length} items to ${OUT_PATH}`);
}

buildFeed().catch((err) => {
  console.error('build-feed failed:', err);
  process.exit(1);
});
