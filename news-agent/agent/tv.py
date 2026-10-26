"""NSA TV — a 24/7 channel built from the Nigeria Student Ambassador YouTube
videos, with automatic switching to a live stream.

The "channel" is a schedule, not an encoder: every viewer computes the same
position in a looping playlist from the clock, so everyone sees the same
programme at the same moment and it costs nothing to run. When the YouTube
channel goes live, the page switches to the live stream; when the stream
ends, it goes back to the schedule.

Settings (all optional, edited in the portal, no redeploy):
  TV_SCHEDULE_JSON  replaces agent/tv.json: {"epoch": ISO, "items": [{id, title, seconds}]}
                    (landscape 16:9 videos only — portrait/Shorts play with black
                    bars beside them, unlike the TV channels)
  TV_LIVE           "auto" (default: detect the YouTube channel going live),
                    "off" (never switch), or a YouTube video id to force live
  TV_LIVE_TITLE     title shown for a forced live stream
  TV_CHANNEL_ID     YouTube channel to watch for live streams
  TV_CHANNELS_JSON  replaces the partner channel list: [{key, name, youtube: channel id}]
"""

from __future__ import annotations

import datetime as dt
import html
import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from agent import shared_cache

CHANNEL_ID = os.environ.get("TV_CHANNEL_ID", "UCGmFthtMUblCvhKjfe3zIhA")
_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_LIVE_CACHE_S = 60
# Requests accept live status up to this old; the warm_caches timer refreshes it every minute.
LIVE_TTL = 90
_live_cache: dict[str, tuple[float, dict | None]] = {}


def schedule() -> dict:
    raw = os.environ.get("TV_SCHEDULE_JSON")
    try:
        if raw:
            data = json.loads(raw)
        else:
            with open(os.path.join(os.path.dirname(__file__), "tv.json"), encoding="utf-8") as f:
                data = json.load(f)
    except Exception:
        logging.exception("tv: bad schedule")
        data = {}
    items = [
        {"id": i["id"], "title": str(i.get("title") or "")[:140], "seconds": int(i["seconds"])}
        for i in data.get("items", [])
        if isinstance(i, dict) and _VIDEO_ID.match(str(i.get("id", ""))) and int(i.get("seconds") or 0) > 0
    ]
    epoch = data.get("epoch") or "2026-10-19T00:00:00Z"
    return {"epoch": dt.datetime.fromisoformat(epoch.replace("Z", "+00:00")).timestamp(), "items": items}


def now_playing(at: float | None = None, upcoming: int = 5) -> dict | None:
    """The scheduled programme at time `at` (default now), its offset and what follows."""
    sched = schedule()
    items = sched["items"]
    if not items:
        return None
    at = time.time() if at is None else at
    loop = sum(i["seconds"] for i in items)
    pos = (at - sched["epoch"]) % loop
    idx = 0
    while pos >= items[idx]["seconds"]:
        pos -= items[idx]["seconds"]
        idx += 1
    starts = at - pos
    nxt, t = [], starts + items[idx]["seconds"]
    for k in range(1, upcoming + 1):
        item = items[(idx + k) % len(items)]
        nxt.append({**item, "starts": t})
        t += item["seconds"]
    return {**items[idx], "index": idx, "offset": pos, "starts": starts, "next": nxt}


def _detect_live(channel_id: str) -> dict | None:
    """Is a YouTube channel live right now? Its /live URL resolves to the
    stream's watch page while live or upcoming (and to the channel otherwise)."""
    r = httpx.get(
        f"https://www.youtube.com/channel/{channel_id}/live",
        headers={"User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36",
                 "Accept-Language": "en-GB"},
        cookies={"SOCS": "CAI"},
        follow_redirects=True,
        timeout=8,
    )
    page = r.text
    # Logged-out data-centre requests get a "confirm you're not a bot" watch page
    # without the canonical link or player data, but ytInitialData still names
    # the video and says whether it's live.
    m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})"', page) or re.search(
        r'"currentVideoEndpoint":\{.{0,400}?"watchEndpoint":\{"videoId":"([A-Za-z0-9_-]{11})"', page)
    if not m or '"isUpcoming":true' in page:
        return None
    if '"isLiveNow":true' not in page and '"isLive":true' not in page:
        return None
    if '"playableInEmbed":false' in page:
        return None
    meta = re.search(r'<meta name="title" content="([^"]*)"', page)
    if meta:
        title = html.unescape(meta.group(1))
    else:
        t = re.search(r'"videoPrimaryInfoRenderer":\{"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"', page)
        title = json.loads(f'"{t.group(1)}"') if t else ""
    return {"id": m.group(1), "title": title or "Live now"}


def _cached_live(channel_id: str) -> dict | None:
    now = time.time()
    hit = _live_cache.get(channel_id)
    if hit and now - hit[0] < _LIVE_CACHE_S:
        return hit[1]
    try:
        value = _detect_live(channel_id)
    except Exception:
        logging.warning("tv: live check failed for %s", channel_id, exc_info=True)
        value = hit[1] if hit else None  # keep the last answer on a blip
    _live_cache[channel_id] = (now, value)
    return value


def live() -> dict | None:
    """NSA's own live stream (switches NSA TV over to it)."""
    mode = (os.environ.get("TV_LIVE") or "auto").strip()
    if mode == "off":
        return None
    if _VIDEO_ID.match(mode):
        return {"id": mode, "title": os.environ.get("TV_LIVE_TITLE") or "Live now"}
    return shared_cache.cached("tv-live", LIVE_TTL, lambda: _detect_live(CHANNEL_ID))


def partner_channels() -> list[dict]:
    """Other channels in the picker: official YouTube live streams of Nigerian
    broadcasters (TV_CHANNELS_JSON overrides agent/tv.json "channels")."""
    raw = os.environ.get("TV_CHANNELS_JSON")
    try:
        if raw:
            rows = json.loads(raw)
        else:
            with open(os.path.join(os.path.dirname(__file__), "tv.json"), encoding="utf-8") as f:
                rows = json.load(f).get("channels", [])
    except Exception:
        logging.exception("tv: bad channel list")
        rows = []
    return [
        {"key": str(c["key"])[:20], "name": str(c["name"])[:40], "youtube": c["youtube"]}
        for c in rows
        if isinstance(c, dict) and c.get("key") and c.get("name") and re.match(r"^UC[A-Za-z0-9_-]{22}$", str(c.get("youtube", "")))
    ]


def channels(ttl: float | None = None) -> list[dict]:
    return shared_cache.cached("tv-channels", ttl or LIVE_TTL, _check_channels)


def _check_channels() -> list[dict]:
    chans = partner_channels()
    with ThreadPoolExecutor(max_workers=6) as pool:
        lives = list(pool.map(lambda c: _cached_live(c["youtube"]), chans))
    out = []
    for c, l in zip(chans, lives):
        if l and l["title"] == "Live now":
            l = {**l, "title": f"{c['name']} — Live"}
        out.append({"key": c["key"], "name": c["name"], "live": l})
    return out


_NSA = ("https://apps.apple.com/app/nigeria-student-ambassador/id6769323984",
        "https://play.google.com/store/apps/details?id=com.nigeriastudentambassador.app")
DEFAULT_TICKER = [
    {"text": "🎓 AI Academy app: practical AI skills for teens and professionals. Download on the App Store & Google Play",
     "ios": "https://apps.apple.com/app/id6816229235",
     "android": "https://play.google.com/store/apps/details?id=org.bsoedu.aiacademy"},
    {"text": "🛍️ Campus Market: buy and sell with students across Nigeria at campusmarket.nigeriastudentcenter.com",
     "url": "https://campusmarket.nigeriastudentcenter.com"},
    {"text": "🌍 Diaspora Market: buy and sell across Nigeria and the diaspora, paid safely with escrow. diasporamarket.nigeriastudentcenter.com",
     "url": "https://diasporamarket.nigeriastudentcenter.com"},
    {"text": "🏠 EstateCopilot app: rent, pay and manage property the smart way. On the App Store & Google Play",
     "ios": "https://apps.apple.com/app/id6816638130",
     "android": "https://play.google.com/store/apps/details?id=org.estatecopilot.app"},
    {"text": "📲 Share Nigeria Student Ambassador: free news, fact-checks and NSA TV. App Store & Google Play",
     "ios": _NSA[0], "android": _NSA[1]},
    {"text": "✅ Heard a rumour? Check it in the app's free Fact Check before you share"},
]
_LINK = re.compile(r"^https://")


def _ticker_item(x) -> dict | None:
    """A message is a string or {text, url?, ios?, android?}; the page opens the
    App Store or Google Play link to match the viewer's phone, else url."""
    if isinstance(x, str):
        x = {"text": x}
    if not isinstance(x, dict) or not x.get("text"):
        return None
    out = {"text": str(x["text"])[:200]}
    for k in ("url", "ios", "android"):
        if x.get(k) and _LINK.match(str(x[k])):
            out[k] = str(x[k])[:300]
    return out


def ticker(headlines: int = 8) -> list[dict]:
    """Scrolling banner: our own messages (TV_TICKER app setting, a JSON list of
    strings or {text, url, ios, android}, replaces the defaults) mixed with the
    latest national headlines (each links to its story)."""
    raw = os.environ.get("TV_TICKER")
    try:
        own = [i for i in (_ticker_item(x) for x in (json.loads(raw) if raw else DEFAULT_TICKER)) if i]
    except Exception:
        logging.exception("tv: bad TV_TICKER")
        own = [_ticker_item(x) for x in DEFAULT_TICKER]
    news: list[dict] = []
    try:
        from agent import public_news
        # Newest first, but take turns between papers so one source can't fill it.
        by_source: dict[str, list[dict]] = {}
        for h in public_news.national_headlines()[:80]:
            if h.get("title"):
                by_source.setdefault(h.get("source") or "News", []).append(h)
        while len(news) < headlines and any(by_source.values()):
            for src in list(by_source):
                if by_source[src] and len(news) < headlines:
                    h = by_source[src].pop(0)
                    item = {"text": f"{src}: {h['title']}"[:200]}
                    if h.get("link") and _LINK.match(h["link"]):
                        item["url"] = h["link"]
                    news.append(item)
    except Exception:
        logging.warning("tv: ticker headlines failed", exc_info=True)
    # One of our messages after every two headlines.
    out, i = [], 0
    for n, line in enumerate(news):
        out.append(line)
        if n % 2 == 1 and own:
            out.append(own[i % len(own)])
            i += 1
    out.extend(own[i:] if i < len(own) else [])
    return out or own


def status() -> dict:
    return {"serverTime": time.time(), "live": live(), "now": now_playing(), "channels": channels(), "ticker": ticker()}
