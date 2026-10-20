"""Azure Functions entry point — runs the ingestion once a day, plus the
fact-check agent and its two public HTTP endpoints.

News schedule: 05:30 UTC = 06:30 Africa/Lagos, so reviewers have a fresh
queue at the start of the working day. Change NEWS_AGENT_CRON in App
Settings to adjust without redeploying.

App Settings required (same names as .env.example):
  GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, ANTHROPIC_API_KEY
  optional: NEWS_AGENT_MODEL, MIN_RELEVANCE, MAX_ITEMS_PER_SOURCE,
            MAX_ARTICLE_AGE_DAYS, NEWS_AGENT_CRON, FACT_AGENT_MODEL,
            FACT_AGENT_CRON, FACT_CORS_ORIGINS, FACT_SUBMIT_RATE_LIMIT_PER_HOUR
"""
from __future__ import annotations

import json
import logging
import os
import time

import azure.functions as func

from agent import graph, public_news, tv
from agent.run import main
from fact_agent.run import main as fact_main

app = func.FunctionApp()

_CRON = os.environ.get("NEWS_AGENT_CRON", "0 30 5 * * *")
_FACT_CRON = os.environ.get("FACT_AGENT_CRON", "0 */15 * * * *")
_CORS_ORIGINS = {
    o.strip()
    for o in os.environ.get(
        "FACT_CORS_ORIGINS",
        "https://news.nigeriastudentambassador.com,http://localhost:5173",
    ).split(",")
    if o.strip()
}
_RATE_LIMIT_PER_HOUR = int(os.environ.get("FACT_SUBMIT_RATE_LIMIT_PER_HOUR", "5"))
_rate_state: dict[str, list[float]] = {}


def _cors_headers(req: func.HttpRequest) -> dict[str, str]:
    origin = req.headers.get("Origin", "")
    if origin in _CORS_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Vary": "Origin",
        }
    return {}


def _rate_limited(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _rate_state.get(ip, []) if now - t < 3600]
    hits.append(now)
    _rate_state[ip] = hits
    return len(hits) > _RATE_LIMIT_PER_HOUR


@app.function_name(name="daily_ingest")
@app.timer_trigger(schedule=_CRON, arg_name="timer", run_on_startup=False, use_monitor=True)
def daily_ingest(timer: func.TimerRequest) -> None:
    if timer.past_due:
        logging.warning("news-agent timer is past due; running now")
    logging.info("news-agent: starting daily ingest")
    rc = main([])
    logging.info("news-agent: finished daily ingest (rc=%s)", rc)
    if rc != 0:
        raise RuntimeError(f"news-agent run returned {rc}")


@app.function_name(name="fact_check_ingest")
@app.timer_trigger(schedule=_FACT_CRON, arg_name="timer", run_on_startup=False, use_monitor=True)
def fact_check_ingest(timer: func.TimerRequest) -> None:
    """Verifies any new Claim Tips every 15 minutes (fast turnaround matters
    for fact-checking). Change FACT_AGENT_CRON in App Settings to adjust."""
    if timer.past_due:
        logging.warning("fact-agent timer is past due; running now")
    logging.info("fact-agent: checking for new claim tips")
    rc = fact_main([])
    logging.info("fact-agent: finished (rc=%s)", rc)
    if rc != 0:
        raise RuntimeError(f"fact-agent run returned {rc}")


@app.function_name(name="warm_caches")
@app.timer_trigger(schedule="0 * * * * *", arg_name="timer", run_on_startup=True, use_monitor=False)
def warm_caches(timer: func.TimerRequest) -> None:
    """Every minute: refresh the shared copies of the national headlines (when
    over 10 min old — requests accept 15) and the NSA TV live checks (when over
    45 s old — requests accept 90), so the app's News feed and NSA TV answer
    straight from storage instead of fetching while the user waits."""
    from agent import shared_cache

    for name, fn in (
        ("national", lambda: shared_cache.cached("news-national", 600, public_news._load_national)),
        ("tv-live", lambda: shared_cache.cached("tv-live", 45, lambda: tv._detect_live(tv.CHANNEL_ID))),
        ("tv-channels", lambda: tv.channels(ttl=45)),
    ):
        try:
            fn()
        except Exception:
            logging.exception("warm_caches: %s failed", name)

@app.function_name(name="factchecks_list")
@app.route(route="factchecks", methods=["GET", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def factchecks_list(req: func.HttpRequest) -> func.HttpResponse:
    """GET /api/factchecks — published verdicts for the public page."""
    headers = _cors_headers(req)
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)
    try:
        rows = graph.published_fact_checks()
    except Exception:
        logging.exception("factchecks_list failed")
        return func.HttpResponse(
            json.dumps({"error": "internal error"}),
            status_code=500,
            headers={**headers, "Content-Type": "application/json"},
        )
    headers["Content-Type"] = "application/json"
    headers["Cache-Control"] = "public, max-age=120"
    return func.HttpResponse(json.dumps(rows), headers=headers)


_MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024
_IMAGE_SIGNATURES = {
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "webp": (b"RIFF",),
    "heic": (b"\x00\x00\x00",),
}


def _store_screenshot(image_b64: str, image_type: str) -> str:
    """Validates a base64 image (type, magic bytes, size) and uploads it."""
    import base64

    ext = image_type.lower().replace("jpg", "jpeg")
    if ext not in _IMAGE_SIGNATURES:
        raise ValueError(f"unsupported image type {image_type!r}")
    data = base64.b64decode(image_b64, validate=True)
    if not data or len(data) > _MAX_SCREENSHOT_BYTES:
        raise ValueError("image empty or too large")
    if not data.startswith(_IMAGE_SIGNATURES[ext]):
        raise ValueError("image content does not match its type")
    return graph.upload_claim_screenshot(data, "jpg" if ext == "jpeg" else ext)


@app.function_name(name="factchecks_submit")
@app.route(
    route="factchecks/submit", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS
)
def factchecks_submit(req: func.HttpRequest) -> func.HttpResponse:
    """POST /api/factchecks/submit — public tip form. Writes a Claim Tip
    (Status=New); the fact_check_ingest timer picks it up within 15 min."""
    headers = _cors_headers(req)
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)
    headers["Content-Type"] = "application/json"

    ip = (req.headers.get("X-Forwarded-For", "unknown") or "unknown").split(",")[0].strip()
    if _rate_limited(ip):
        return func.HttpResponse(
            json.dumps({"error": "too many submissions, try again later"}),
            status_code=429,
            headers=headers,
        )

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "invalid JSON body"}), status_code=400, headers=headers
        )

    claim_text = (body.get("claim_text") or "").strip()
    if not claim_text or len(claim_text) > 2000:
        return func.HttpResponse(
            json.dumps({"error": "claim_text is required (max 2000 characters)"}),
            status_code=400,
            headers=headers,
        )

    tip = {
        "claim_text": claim_text,
        "source_url": (body.get("source_url") or "").strip(),
        "submitted_by": (body.get("submitted_by") or "").strip(),
        "contact_info": (body.get("contact_info") or "").strip(),
        "state": (body.get("state") or "").strip(),
        "lga": (body.get("lga") or "").strip(),
    }
    # Optional screenshot from the app (camera / photo library). A bad or
    # failed image never blocks the tip itself.
    image_b64 = body.get("image_base64")
    if isinstance(image_b64, str) and image_b64:
        try:
            tip["screenshot_url"] = _store_screenshot(image_b64, str(body.get("image_type") or "jpeg"))
        except Exception:
            logging.exception("factchecks_submit: screenshot not stored")
    try:
        graph.create_claim_tip(tip)
    except Exception:
        logging.exception("factchecks_submit failed")
        return func.HttpResponse(
            json.dumps({"error": "internal error"}), status_code=500, headers=headers
        )
    return func.HttpResponse(json.dumps({"status": "received"}), status_code=201, headers=headers)


_VIDEO_ID = __import__("re").compile(r"^[A-Za-z0-9_-]{11}$")


@app.function_name(name="video_player")
@app.route(route="player", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def video_player(req: func.HttpRequest) -> func.HttpResponse:
    """GET /api/player?v=<YouTube id> — a minimal page that embeds one video.
    The NSA app shows it in its in-app player: YouTube refuses embeds from an
    app's local origin (error 153), so the embed needs a real https page."""
    vid = req.params.get("v", "")
    if not _VIDEO_ID.match(vid):
        return func.HttpResponse("Not found", status_code=404)
    page = f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>Video</title>
<style>html,body{{margin:0;height:100%;background:#000}}iframe{{position:fixed;inset:0;width:100%;height:100%;border:0}}</style>
</head><body>
<iframe src="https://www.youtube-nocookie.com/embed/{vid}?autoplay=1&playsinline=1&rel=0&modestbranding=1"
 allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
 referrerpolicy="strict-origin-when-cross-origin" title="Video"></iframe>
</body></html>"""
    return func.HttpResponse(
        page,
        status_code=200,
        mimetype="text/html",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-src https://www.youtube-nocookie.com https://www.youtube.com",
            "Referrer-Policy": "strict-origin-when-cross-origin",
        },
    )


_TV_PAGE_URL = "https://func-rni-newsagent.azurewebsites.net/api/tv"


@app.function_name(name="tv_page")
@app.route(route="tv", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def tv_page(req: func.HttpRequest) -> func.HttpResponse:
    """GET /api/tv — NSA TV, the 24/7 channel (agent/tv.py). Opened from the
    NSA app's News feed card, so it needs no app update."""
    with open(os.path.join(os.path.dirname(__file__), "agent", "tv.html"), encoding="utf-8") as f:
        page = f.read()
    return func.HttpResponse(
        page,
        status_code=200,
        mimetype="text/html",
        headers={
            "Cache-Control": "no-cache",
            "Content-Security-Policy": (
                "default-src 'none'; style-src 'unsafe-inline'; "
                "script-src 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; "
                "img-src https://i.ytimg.com; connect-src 'self'; "
                "frame-src https://www.youtube-nocookie.com https://www.youtube.com"
            ),
            "Referrer-Policy": "strict-origin-when-cross-origin",
        },
    )


@app.function_name(name="tv_now")
@app.route(route="tv/now", methods=["GET", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def tv_now(req: func.HttpRequest) -> func.HttpResponse:
    """GET /api/tv/now — server time, the live stream (if any) and the schedule position."""
    headers = _cors_headers(req)
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)
    headers.update({"Content-Type": "application/json", "Cache-Control": "no-store"})
    return func.HttpResponse(json.dumps(tv.status()), headers=headers)


def _tv_card() -> dict | None:
    """The NSA TV card for the News feed: says LIVE while a stream is on."""
    if (os.environ.get("TV_CARD") or "on") == "off":
        return None
    try:
        live = tv.live()
        now = None if live else tv.now_playing()
    except Exception:
        logging.exception("tv card failed")
        return None
    if live:
        title, body, vid = f"🔴 LIVE now on NSA TV: {live['title']}", "Watch the live stream free in the app. Tap to join.", live["id"]
    elif now:
        title, body, vid = "📺 NSA TV — free, 24/7", f"On now: {now['title']}. Our channel plays non-stop and goes live from the road. Tap to watch.", now["id"]
    else:
        return None
    return {"id": "nsa-tv", "advertiser": "NSA TV", "title": title, "body": body,
            "url": _TV_PAGE_URL, "imageUrl": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"}


@app.function_name(name="news_national")
@app.route(route="news/national", methods=["GET", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def news_national(req: func.HttpRequest) -> func.HttpResponse:
    """GET /api/news/national — latest national headlines (cached 15 min)."""
    headers = _cors_headers(req)
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)
    try:
        rows = public_news.national_headlines()
    except Exception:
        logging.exception("news_national failed")
        return func.HttpResponse(json.dumps({"error": "internal error"}), status_code=500,
                                 headers={**headers, "Content-Type": "application/json"})
    tv_item = _tv_feed_item()
    if tv_item:
        rows = [tv_item, *rows]
    headers.update({"Content-Type": "application/json", "Cache-Control": "public, max-age=120"})
    return func.HttpResponse(json.dumps(rows), headers=headers)


def _tv_feed_item() -> dict | None:
    """NSA TV pinned at the top of the app's National news feed, so the live
    app shows it with no app update (TV_FEED=off removes it). Its source
    "NSA TV" also appears as a filter chip above the feed."""
    if (os.environ.get("TV_FEED") or "on") == "off":
        return None
    import datetime as _dt
    try:
        live = tv.live()
        now = None if live else tv.now_playing()
        partners = [c for c in tv.channels() if c["live"]]
    except Exception:
        logging.exception("tv feed item failed")
        return None
    names = ", ".join(c["name"] for c in partners[:4])
    extra = f" Switch to {names} live with one tap." if names else ""
    if live:
        title = f"🔴 LIVE on NSA TV: {live['title']}"
        summary = f"Nigeria Student Ambassador is live now. Tap to watch free.{extra}"
    elif now:
        title = "📺 NSA TV: free TV for every Nigerian, 24/7"
        summary = f"On now: {now['title']}.{extra} Tap to watch."
    else:
        return None
    return {"title": title, "summary": summary, "link": _TV_PAGE_URL, "source": "NSA TV",
            "publishedAt": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


@app.function_name(name="sponsors")
@app.route(route="sponsors", methods=["GET", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def sponsors(req: func.HttpRequest) -> func.HttpResponse:
    """GET /api/sponsors[?placement=news] — paid sponsor banners for the
    Nigeria Student Ambassador app/site. Source: the SPONSORS_JSON app setting
    if set (edit it in the portal, no redeploy), else agent/sponsors.json.
    Each entry: {id, advertiser, title, body, url, imageUrl?, placements?[],
    starts?, ends?} — expired or not-yet-started entries are filtered out.
    Empty list = the app shows its own "Advertise with us" card instead."""
    headers = _cors_headers(req)
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)
    import datetime as _dt
    raw = os.environ.get("SPONSORS_JSON")
    try:
        if raw:
            rows = json.loads(raw)
        else:
            with open(os.path.join(os.path.dirname(__file__), "agent", "sponsors.json"), encoding="utf-8") as f:
                rows = json.load(f)
    except Exception:
        logging.exception("sponsors: bad sponsor data")
        rows = []
    placement = (req.params.get("placement") or "")[:30]
    today = _dt.date.today().isoformat()
    out = []
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict) or not r.get("url") or not r.get("title") or not r.get("advertiser"):
            continue
        if r.get("starts") and str(r["starts"]) > today:
            continue
        if r.get("ends") and str(r["ends"]) < today:
            continue
        if placement and r.get("placements") and placement not in r["placements"]:
            continue
        out.append({k: r.get(k) for k in ("id", "advertiser", "title", "body", "url", "imageUrl")})
    if placement in ("", "news"):
        card = _tv_card()
        if card:
            out.insert(0, card)
    headers.update({"Content-Type": "application/json", "Cache-Control": "public, max-age=120"})
    return func.HttpResponse(json.dumps(out), headers=headers)


@app.function_name(name="news_local")
@app.route(route="news/local", methods=["GET", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def news_local(req: func.HttpRequest) -> func.HttpResponse:
    """GET /api/news/local[?state=&lga=] — Published local-government stories."""
    headers = _cors_headers(req)
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)
    state = (req.params.get("state") or "")[:60]
    lga = (req.params.get("lga") or "")[:80]
    try:
        rows = public_news.published_local_news(state, lga)
    except Exception:
        logging.exception("news_local failed")
        return func.HttpResponse(json.dumps({"error": "internal error"}), status_code=500,
                                 headers={**headers, "Content-Type": "application/json"})
    headers.update({"Content-Type": "application/json", "Cache-Control": "public, max-age=120"})
    return func.HttpResponse(json.dumps(rows), headers=headers)
