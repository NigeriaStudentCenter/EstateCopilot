# RNI News Agent

A research agent that scans Nigerian news sources every day, pins each story to
a single **Local Government Area**, and drops it into the **News** list on the
*Return to Nigeria Initiative* SharePoint site with `Status = Needs review`.
Nothing is published automatically — a human approves each item.

```
News Sources list ──► fetchers ──► candidates ──► classify (Claude) ──► News list
 (47 rows, editable)   RSS/Search/HTML          one tool call/article    (Needs review)
```

## How it works

| Step | File | What it does |
|---|---|---|
| 1. Read sources | `agent/graph.py` `active_sources()` | Pulls every row from **News Sources** where `Active` is true. |
| 2. Fetch | `agent/fetchers.py` | `RSS` / `Search` rows are parsed as feeds; `HTML` rows are scraped with a CSS selector. Google News links are resolved to the real publisher URL and the **article body** is downloaded (direct, then the `r.jina.ai` reader proxy if the site 403s — toggle with `READER_FALLBACK`). Only items newer than `MAX_ARTICLE_AGE_DAYS` are kept. |
| 3. Classify | `agent/classify.py` | One forced `record_article` tool call per article. Claude assigns state + LGA (validated against the canonical 774-LGA list in `agent/lgas.json`), a clean headline, a summary, a category, an event date and a 0–100 relevance score. It must also quote a **verbatim phrase** from the fetched text that identifies the LGA; `_validate()` rejects the record if that quote isn't actually present, so the model can't guess an LGA from a bare place name. Anything that isn't specific local-government news is dropped. |
| 4. Write | `agent/graph.py` `create_news_item()` | New stories (deduped by `ArticleKey`) are inserted into **News**. Each source row's `Last polled` / `Last result` is stamped. |

## SharePoint objects it touches

| Object | ID |
|---|---|
| Site | `bsoed.sharepoint.com:/sites/ReturntoNigeriaInitiative` |
| News list | `3b546f10-aff5-4014-8a5a-81411efd974b` |
| News Sources list | `588e60d7-85a9-4196-8411-c1e8a5ab2534` |

## Auth / permissions

App-only Microsoft Graph (client credentials), reusing the app registration the
onboarding flow uses (`e7494643-582b-4817-995e-8a02ebab786e`). It needs
**`Sites.ReadWrite.All`** with admin consent — already granted. The client
secret must be rotated before first use (the current one was exposed in a flow
package export) and stored only in `.env` locally / App Settings in Azure.

The Anthropic key should be a **dedicated** key for this agent so its spend is
attributable and it can be revoked independently of the student-tools proxy.

## Run locally

```bash
cd news-agent
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then fill in GRAPH_CLIENT_SECRET + ANTHROPIC_API_KEY

# see what it would write, without touching SharePoint:
python -m agent.run --dry-run

# just one source, for a quick check:
python -m agent.run --dry-run --only "Lagos"

# real run:
python -m agent.run
```

`--limit-sources N` stops after N sources while debugging.

## Deploy (Azure Functions, Python 3.11, Linux Consumption)

`function_app.py` is a timer trigger — `daily_ingest` runs at **05:30 UTC**
(06:30 Africa/Lagos). Override with the `NEWS_AGENT_CRON` app setting (NCRONTAB,
6 fields).

```bash
func azure functionapp publish <app-name> --python
```

Set these App Settings on the Function App (same names as `.env.example`):
`GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `ANTHROPIC_API_KEY`,
and optionally `NEWS_AGENT_MODEL`, `MIN_RELEVANCE`, `MAX_ITEMS_PER_SOURCE`,
`MAX_ARTICLE_AGE_DAYS`, `NEWS_AGENT_CRON`. Don't ship `local.settings.json`.

## Tuning (env vars)

| Var | Default | Meaning |
|---|---|---|
| `NEWS_AGENT_MODEL` | `claude-haiku-4-5` | Classifier model. Bump to `claude-opus-5` for harder LGA disambiguation. |
| `MIN_RELEVANCE` | `55` | Stories scored below this are discarded. |
| `MAX_ITEMS_PER_SOURCE` | `12` | Cap on candidates kept per source per run. |
| `MAX_ARTICLE_AGE_DAYS` | `4` | Ignore anything older. |
| `READER_FALLBACK` | `1` | `0` disables the r.jina.ai reader-proxy fallback for scraper-blocked sites (stays direct-only, no third party). |

## Adding / removing sources

Edit the **News Sources** list in SharePoint — no redeploy needed.

- **RSS** — `URL or query` is a real feed URL.
- **Search** — `URL or query` is a Google News RSS *search* URL
  (`https://news.google.com/rss/search?q=...&hl=en-NG&gl=NG&ceid=NG:en`).
- **HTML** — `URL or query` is a page URL and `Item selector` is a CSS selector
  matching the headline `<a>` elements.

Set `State` / `LGA` on a row to give the classifier a weak prior (used only as a
hint, never trusted outright).
