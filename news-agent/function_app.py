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

from agent import graph, public_news
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
    try:
        graph.create_claim_tip(tip)
    except Exception:
        logging.exception("factchecks_submit failed")
        return func.HttpResponse(
            json.dumps({"error": "internal error"}), status_code=500, headers=headers
        )
    return func.HttpResponse(json.dumps({"status": "received"}), status_code=201, headers=headers)


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
    headers.update({"Content-Type": "application/json", "Cache-Control": "public, max-age=300"})
    return func.HttpResponse(json.dumps(rows), headers=headers)


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
