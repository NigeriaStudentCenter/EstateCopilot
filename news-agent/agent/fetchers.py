"""Turn a News Source row into a list of raw candidate articles.

Three source types:
  RSS     - a real feed URL (national outlets)
  Search  - a Google News RSS *search* URL (also parsed as a feed)
  HTML    - a page URL + CSS selector for <a> elements (last resort)

Google News links are opaque redirects, so for RSS/Search entries we resolve
each one to its real publisher URL and fetch the article body. The classifier
needs that body to pin the story to a single LGA instead of guessing from a
neighbourhood name in the headline.

A "candidate" is {title, link, published, snippet, body, source_name,
hint_state, hint_lga}. The model does the real work of deciding LGA / category
/ relevance.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import re
from typing import Any

import feedparser
import httpx
from selectolax.parser import HTMLParser

from . import config

try:
    from googlenewsdecoder import gnewsdecoder
except Exception:  # optional; without it GN links just aren't enriched
    gnewsdecoder = None

_CONSENT = {"CONSENT": "YES+cb.20210328-17-p0.en+FX+000", "SOCS": "CAI"}
_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)
_MAX_BODY_CHARS = 3500


def article_key(link: str) -> str:
    """Stable dedup key: normalise the URL, hash it."""
    u = re.sub(r"[#?].*$", "", (link or "").strip().lower().rstrip("/"))
    u = re.sub(r"^https?://(www\.)?", "", u)
    return hashlib.sha1(u.encode("utf-8")).hexdigest()[:20] or "empty"


def _recent(published_parsed) -> bool:
    if not published_parsed:
        return True  # keep undated items; the model can still score them
    try:
        ts = dt.datetime(*published_parsed[:6], tzinfo=dt.timezone.utc)
    except Exception:
        return True
    age = dt.datetime.now(dt.timezone.utc) - ts
    return age.days <= config.MAX_ARTICLE_AGE_DAYS


def _clean(text: str) -> str:
    return re.sub(
        r"\s+", " ", HTMLParser(text or "").text() if "<" in (text or "") else (text or "")
    ).strip()


def _iso(published_parsed) -> str | None:
    if not published_parsed:
        return None
    try:
        return dt.datetime(*published_parsed[:6], tzinfo=dt.timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    except Exception:
        return None


def _resolve_link(link: str) -> str:
    """Google News redirect -> real publisher URL (best effort)."""
    if "news.google.com" not in link or gnewsdecoder is None:
        return link
    try:
        out = gnewsdecoder(link, interval=0.6)
        if out.get("status") and out.get("decoded_url"):
            return out["decoded_url"]
    except Exception:
        pass
    return link


def _direct_body(url: str) -> str:
    """Fetch the publisher page directly and pull readable text. '' on failure."""
    try:
        r = httpx.get(
            url,
            headers={"User-Agent": _BROWSER_UA},
            cookies=_CONSENT,
            timeout=config.HTTP_TIMEOUT,
            follow_redirects=True,
        )
        r.raise_for_status()
    except Exception:
        return ""
    tree = HTMLParser(r.text)
    for junk in tree.css("script,style,noscript,header,footer,nav,aside,form,figure"):
        junk.decompose()
    node = tree.css_first("article") or tree.css_first("main") or tree.body
    if node is None:
        return ""
    paras = [p.text(strip=True) for p in node.css("p")]
    text = " ".join(t for t in paras if t and len(t) > 1)
    if len(text) < 200:  # sites that don't use <p>
        text = re.sub(r"\s+", " ", node.text(separator=" ")).strip()
    return text


_READER_JUNK = ("performing security verification", "just a moment", "enable javascript and cookies")


def _reader_body(url: str) -> str:
    """r.jina.ai reader proxy — bypasses Cloudflare 403s and broken TLS.
    Note: sending a browser User-Agent trips Cloudflare *on r.jina.ai itself*,
    so keep the headers minimal."""
    try:
        r = httpx.get(
            "https://r.jina.ai/" + url,
            headers={"Accept": "text/plain", "X-Return-Format": "text"},
            timeout=max(config.HTTP_TIMEOUT, 30.0),
            follow_redirects=True,
        )
        r.raise_for_status()
    except Exception:
        return ""
    text = re.sub(r"\s+", " ", r.text).strip()
    if len(text) < 300 or any(j in text.lower() for j in _READER_JUNK):
        return ""  # reader also hit a bot wall
    return text


def _article_body(url: str) -> str:
    """Readable article text, '' if it can't be had. Tries a direct fetch, then
    the reader proxy when the site blocks us (unless READER_FALLBACK=0)."""
    if not url or "news.google.com" in url:
        return ""
    text = _direct_body(url)
    if len(text) < 400 and config.READER_FALLBACK:
        alt = _reader_body(url)
        if len(alt) > len(text):
            text = alt
    return text[:_MAX_BODY_CHARS]


def fetch(source: dict[str, Any]) -> list[dict[str, Any]]:
    stype = (source.get("type") or "RSS").upper()
    if stype in ("RSS", "SEARCH"):
        return _fetch_feed(source)
    if stype == "HTML":
        return _fetch_html(source)
    return []


def _fetch_feed(source: dict[str, Any]) -> list[dict[str, Any]]:
    last_err: Exception | None = None
    feed = None
    for attempt in range(2):
        try:
            resp = httpx.get(
                source["url"],
                headers={"User-Agent": config.USER_AGENT},
                timeout=config.HTTP_TIMEOUT + attempt * 15,
                follow_redirects=True,
            )
            resp.raise_for_status()
            feed = feedparser.parse(resp.content)
            last_err = None
            break
        except Exception as e:  # network / parse errors are non-fatal per source
            last_err = e
    if last_err is not None:
        raise RuntimeError(f"feed error: {last_err}") from last_err

    out: list[dict[str, Any]] = []
    for entry in feed.entries[: config.MAX_ITEMS_PER_SOURCE * 3]:
        if not _recent(entry.get("published_parsed")):
            continue
        raw_link = entry.get("link") or ""
        title = _clean(entry.get("title", ""))
        if not raw_link or not title:
            continue
        link = _resolve_link(raw_link)
        snippet = _clean(entry.get("summary", "") or entry.get("description", ""))[:600]
        out.append(
            {
                "title": title,
                "link": link,
                "published": _iso(entry.get("published_parsed")),
                "snippet": snippet,
                "body": _article_body(link),
                "source_name": source["name"],
                "hint_state": source.get("state", ""),
                "hint_lga": source.get("lga", ""),
                "hint_scope": source.get("scope", ""),
            }
        )
        if len(out) >= config.MAX_ITEMS_PER_SOURCE:
            break
    return out


def _fetch_html(source: dict[str, Any]) -> list[dict[str, Any]]:
    sel = source.get("selector") or "a"
    resp = httpx.get(
        source["url"],
        headers={"User-Agent": config.USER_AGENT},
        timeout=config.HTTP_TIMEOUT,
        follow_redirects=True,
    )
    resp.raise_for_status()
    doc = HTMLParser(resp.text)
    base = str(resp.url)
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for a in doc.css(sel):
        href = a.attributes.get("href") or ""
        title = _clean(a.text())
        if not href or len(title) < 20:
            continue
        link = httpx.URL(base).join(href).__str__()
        if link in seen:
            continue
        seen.add(link)
        out.append(
            {
                "title": title,
                "link": link,
                "published": None,
                "snippet": "",
                "body": _article_body(link),
                "source_name": source["name"],
                "hint_state": source.get("state", ""),
                "hint_lga": source.get("lga", ""),
                "hint_scope": source.get("scope", ""),
            }
        )
        if len(out) >= config.MAX_ITEMS_PER_SOURCE:
            break
    return out
