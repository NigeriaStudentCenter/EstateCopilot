// Generates a ready-to-paste "top 5 stories" text digest from the feed —
// this is the Phase-1 audience-building content the monetization plan
// depends on (X thread, WhatsApp broadcast text). It does NOT post
// anywhere itself: no X/WhatsApp API keys exist yet, and auto-posting on
// someone's behalf is a standing decision that needs its own explicit
// go-ahead, not something to wire in quietly. This just writes the text
// so a human (or a future scheduled task, once approved) can paste it in.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESKS } from './sources.js';

interface FeedItem {
  id: string;
  desks: string[];
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt: string;
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const feed = JSON.parse(readFileSync(path.join(dirname, '../src/feed.json'), 'utf-8')) as {
  generatedAt: string;
  items: FeedItem[];
};

// One story per major desk keeps the digest varied rather than five
// Top Stories items in a row — matches how a human editor would pick a
// "front page" rundown.
const DIGEST_DESKS = ['top-stories', 'politics', 'business', 'sports', 'entertainment'];

// Track the desk each item was picked FOR, not item.desks[0] — a general
// daily's home desk is always 'top-stories' regardless of which keyword
// desk (politics/business/sports) also matched, so labeling by desks[0]
// would mislabel every cross-tagged pick.
const picked: { item: FeedItem; pickedFor: string }[] = [];
for (const desk of DIGEST_DESKS) {
  const item = feed.items.find((i) => i.desks.includes(desk) && !picked.some((p) => p.item === i));
  if (item) picked.push({ item, pickedFor: desk });
}
for (const item of feed.items) {
  if (picked.length >= 5) break;
  if (!picked.some((p) => p.item === item)) picked.push({ item, pickedFor: item.desks[0] });
}

const dateLabel = new Date(feed.generatedAt).toLocaleDateString('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const deskLabel = (id: string) => DESKS.find((d) => d.id === id)?.label ?? id;

const lines = [
  `🇳🇬 Naija Digest — ${dateLabel}`,
  '',
  ...picked.slice(0, 5).map((p, i) => `${i + 1}. [${deskLabel(p.pickedFor)}] ${p.item.title} — ${p.item.source}`),
  '',
  'Full stories + links: https://news.nigeriastudentambassador.com',
];

const output = lines.join('\n');
writeFileSync(path.join(dirname, '../public/digest.txt'), output);
console.log(output);
