"""Read-only public news for apps and websites (Nigeria Student Ambassador app).

- national_headlines(): latest items from the *National* RSS rows of the News
  Sources list, fetched live and cached in memory for 15 minutes.
- published_local_news(): LGA stories from the News list with Status ==
  "Published" only (the human review queue decides what goes public).
"""
from __future__ import annotations

import calendar
import concurrent.futures as cf
import html
import re
import time
from typing import Any

import feedparser
import httpx

from . import config, graph

_NATIONAL_TTL = 15 * 60
_LOCAL_TTL = 5 * 60
_cache: dict[str, tuple[float, Any]] = {}
_TAG_RE = re.compile(r"<[^>]+>")


def _cached(key: str, ttl: int, load):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    value = load()
    _cache[key] = (time.time(), value)
    return value


def _clean(text: str, limit: int = 280) -> str:
    text = _TAG_RE.sub(" ", text or "")
    # Some feeds double-encode punctuation ("Arsenal&#8217;s" arrives as text).
    for _ in range(2):
        decoded = html.unescape(text)
        if decoded == text:
            break
        text = decoded
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def _feed_items(source: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        r = httpx.get(source["url"], timeout=15, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0 (NSA news reader)"})
        feed = feedparser.parse(r.content)
    except Exception:
        return []
    out = []
    for e in feed.entries[:20]:
        link = e.get("link", "")
        title = _clean(e.get("title", ""), 200)
        if not link or not title:
            continue
        ts = e.get("published_parsed") or e.get("updated_parsed")
        out.append({
            "title": title,
            "summary": _clean(e.get("summary", "")),
            "link": link,
            "source": source["name"],
            "publishedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", ts) if ts else None,
            "_ts": calendar.timegm(ts) if ts else 0,
        })
    return out


def _load_national() -> list[dict[str, Any]]:
    sources = [s for s in graph.active_sources()
               if s["scope"].lower() == "national" and s["type"] == "RSS" and s["url"]]
    items: list[dict[str, Any]] = []
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        for batch in pool.map(_feed_items, sources):
            items.extend(batch)
    seen: set[str] = set()
    unique = []
    for it in sorted(items, key=lambda x: x["_ts"], reverse=True):
        key = it["title"].lower()[:80]
        if key in seen:
            continue
        seen.add(key)
        it.pop("_ts", None)
        unique.append(it)
    return unique[:120]


def national_headlines() -> list[dict[str, Any]]:
    return _cached("national", _NATIONAL_TTL, _load_national)


def _load_local() -> list[dict[str, Any]]:
    rows = graph._list_items(
        config.LIST_NEWS,
        {
            "$expand": "fields($select=Title,Status,State,LGA,Summary,Category,EventDate,SourceUrl,SourceName)",
            "$select": "id",
            "$top": "2000",
        },
    )
    out = []
    for r in rows:
        f = r.get("fields", {})
        if f.get("Status") != "Published":
            continue
        out.append({
            "id": r["id"],
            "headline": f.get("Title", ""),
            "summary": f.get("Summary", ""),
            "state": f.get("State", ""),
            "lga": f.get("LGA", ""),
            "category": f.get("Category", ""),
            "eventDate": f.get("EventDate"),
            "link": f.get("SourceUrl", ""),
            "source": f.get("SourceName", ""),
        })
    out.sort(key=lambda x: x.get("eventDate") or "", reverse=True)
    return out


def published_local_news(state: str = "", lga: str = "", limit: int = 200) -> list[dict[str, Any]]:
    items = _cached("local", _LOCAL_TTL, _load_local)
    if state:
        items = [i for i in items if i["state"].lower() == state.lower()]
    if lga:
        items = [i for i in items if i["lga"].lower() == lga.lower()]
    return items[:limit]
