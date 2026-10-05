"""Thin Microsoft Graph client for the News + News Sources SharePoint lists.

App-only auth (client credentials) with the same app registration the
onboarding flow uses. Requires Sites.ReadWrite.All (admin-consented).
"""
from __future__ import annotations

import time
from typing import Any, Iterable

import httpx

from . import config

_GRAPH = "https://graph.microsoft.com/v1.0"
_token: dict[str, Any] = {"value": None, "exp": 0.0}


def _access_token() -> str:
    if _token["value"] and time.time() < _token["exp"] - 60:
        return _token["value"]
    r = httpx.post(
        f"https://login.microsoftonline.com/{config.TENANT_ID}/oauth2/v2.0/token",
        data={
            "grant_type": "client_credentials",
            "client_id": config.CLIENT_ID,
            "client_secret": config.CLIENT_SECRET,
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=config.HTTP_TIMEOUT,
    )
    r.raise_for_status()
    j = r.json()
    _token["value"] = j["access_token"]
    _token["exp"] = time.time() + j.get("expires_in", 3600)
    return _token["value"]


def _client() -> httpx.Client:
    return httpx.Client(
        base_url=_GRAPH,
        headers={"Authorization": f"Bearer {_access_token()}"},
        timeout=config.HTTP_TIMEOUT,
    )


_site_id: str | None = None


def site_id() -> str:
    global _site_id
    if _site_id is None:
        with _client() as c:
            r = c.get(f"/sites/{config.SITE_PATH}", params={"$select": "id"})
            r.raise_for_status()
            _site_id = r.json()["id"]
    return _site_id


def _list_items(list_id: str, params: dict[str, str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    with _client() as c:
        url = f"/sites/{site_id()}/lists/{list_id}/items"
        p = dict(params)
        while url:
            r = c.get(url, params=p)
            r.raise_for_status()
            j = r.json()
            out.extend(j.get("value", []))
            url = j.get("@odata.nextLink")
            p = {}  # nextLink already carries the query
    return out


# --- News Sources -----------------------------------------------------
def active_sources() -> list[dict[str, Any]]:
    """Each row -> {id, name, scope, state, lga, type, url, selector, keywords}."""
    rows = _list_items(
        config.LIST_SOURCES,
        {
            "$expand": "fields",
            "$select": "id",
            "$top": "200",
        },
    )
    src: list[dict[str, Any]] = []
    for row in rows:
        f = row.get("fields", {})
        if not f.get("Active", True):
            continue
        src.append(
            {
                "item_id": row["id"],
                "name": f.get("Title", ""),
                "scope": f.get("Scope", ""),
                "state": (f.get("State") or "").strip(),
                "lga": (f.get("LGA") or "").strip(),
                "type": f.get("Source_x0020_type", "RSS"),
                "url": (f.get("URL_x0020_or_x0020_query") or "").strip(),
                "selector": (f.get("Item_x0020_selector") or "").strip(),
                "keywords": (f.get("Keywords") or "").strip(),
            }
        )
    return src


def mark_source_polled(item_id: str, summary: str) -> None:
    with _client() as c:
        c.patch(
            f"/sites/{site_id()}/lists/{config.LIST_SOURCES}/items/{item_id}/fields",
            json={
                "Last_x0020_polled": _utcnow(),
                "Last_x0020_result": summary[:900],
            },
        ).raise_for_status()


# --- News ----------------------------------------------------------
def existing_article_keys() -> set[str]:
    """All ArticleKeys currently in News, for dedup. The list stays modest
    (reviewers publish or reject), so an unbounded pull is fine."""
    rows = _list_items(
        config.LIST_NEWS,
        {
            "$expand": "fields($select=ArticleKey)",
            "$select": "id",
            "$top": "2000",
            "$orderby": "lastModifiedDateTime desc",
        },
    )
    return {
        (r.get("fields", {}).get("ArticleKey") or "").strip()
        for r in rows
        if r.get("fields", {}).get("ArticleKey")
    }


def recent_items_for_dedup(days: int = 10) -> list[tuple[str, str]]:
    """(LGA, Title) for News items touched in the last `days` — for near-dup
    detection against what's already in the queue."""
    from datetime import datetime, timedelta, timezone

    # SharePoint list items reject $filter/$orderby on lastModifiedDateTime
    # without an index (HTTP 400), so just pull the list (it's a review queue,
    # it stays small) and let the caller use all of it.
    _ = days  # kept for signature compatibility
    rows = _list_items(
        config.LIST_NEWS,
        {"$expand": "fields($select=Title,LGA)", "$select": "id", "$top": "999"},
    )
    out = []
    for r in rows:
        f = r.get("fields", {})
        if f.get("Title"):
            out.append((f.get("LGA") or "", f["Title"]))
    return out


def create_news_item(item: dict[str, Any]) -> str:
    """item keys -> News internal names. The URL goes in SourceUrl (plain text):
    the 'Source Link' hyperlink column can't be written via app-only Graph."""
    fields = {
        "Title": item["headline"][:255],
        "LGA": item["lga"][:255],
        "State": item["state"][:255],
        "Summary": item["summary"],
        "Category": item["category"],
        "Status": "Needs review",
        "EventDate": item.get("event_date") or _utcnow(),
        "SourceUrl": item["url"][:255],
        "SourceName": item["source_name"][:255],
        "ArticleKey": item["article_key"][:255],
        "Relevance": int(item["relevance"]),
    }
    url = f"/sites/{site_id()}/lists/{config.LIST_NEWS}/items"
    last = None
    for attempt in range(3):
        with _client() as c:
            r = c.post(url, json={"fields": fields})
        if r.status_code < 300:
            return r.json()["id"]
        last = r
        if r.status_code not in (429, 500, 503):
            break
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(
        f"create_news_item {last.status_code}: {last.text[:400]}" if last is not None else "no response"
    )


# Appended to ClaimText when the submitter attached a screenshot (app only).
# Reviewers see the link; new_claim_tips() strips it before the AI reads the claim.
SCREENSHOT_MARK = "\n\n[Screenshot from submitter] "


def upload_claim_screenshot(data: bytes, ext: str) -> str:
    """Stores a submitter's screenshot in the site's documents library
    (folder 'Claim Screenshots') and returns its SharePoint link — visible to
    site members only, never public."""
    import uuid

    name = f"{time.strftime('%Y-%m-%d')}-{uuid.uuid4().hex[:12]}.{ext}"
    content_type = {"png": "image/png", "webp": "image/webp", "heic": "image/heic"}.get(ext, "image/jpeg")
    url = f"/sites/{site_id()}/drive/root:/Claim Screenshots/{name}:/content"
    with _client() as c:
        r = c.put(url, content=data, headers={"Content-Type": content_type})
    r.raise_for_status()
    return r.json().get("webUrl", "")


def create_claim_tip(item: dict[str, Any]) -> str:
    """Public-facing intake: a raw, unverified tip from the web form or a
    Teams/ambassador submission. Always lands with Status=New."""
    claim_text = item["claim_text"]
    if item.get("screenshot_url"):
        mark = SCREENSHOT_MARK + item["screenshot_url"]
        claim_text = claim_text[: 2000 - len(mark)] + mark
    fields = {
        "Title": (item["claim_text"][:100] + "…") if len(item["claim_text"]) > 100 else item["claim_text"],
        "ClaimText": claim_text[:2000],
        "SourceUrl": item.get("source_url", "")[:500],
        "SubmittedBy": item.get("submitted_by", "")[:200],
        "ContactInfo": item.get("contact_info", "")[:200],
        "State": item.get("state", "")[:100],
        "LGA": item.get("lga", "")[:100],
        "Status": "New",
        "DateSubmitted": _utcnow(),
    }
    url = f"/sites/{site_id()}/lists/{config.LIST_CLAIMTIPS}/items"
    with _client() as c:
        r = c.post(url, json={"fields": fields})
    r.raise_for_status()
    return r.json()["id"]


def published_fact_checks(limit: int = 300) -> list[dict[str, Any]]:
    """Status == 'Published' rows for the public fact-check page, newest
    DateChecked first."""
    rows = _list_items(
        config.LIST_FACTCHECKS,
        {
            "$expand": "fields($select=Title,Status,Claim,Verdict,Confidence,Evidence,SourceUrl,"
            "SourceName,Category,State,LGA,RaceLevel,Candidate,Party,ClaimDate,DateChecked)",
            "$select": "id",
            "$top": "2000",
        },
    )
    out = []
    for r in rows:
        f = r.get("fields", {})
        if f.get("Status", "") != "Published":
            continue
        out.append(
            {
                "id": r["id"],
                "headline": f.get("Title", ""),
                "claim": f.get("Claim", ""),
                "verdict": f.get("Verdict", ""),
                "confidence": f.get("Confidence"),
                "evidence": f.get("Evidence", ""),
                "source_url": f.get("SourceUrl", ""),
                "source_name": f.get("SourceName", ""),
                "category": f.get("Category", ""),
                "state": f.get("State", ""),
                "lga": f.get("LGA", ""),
                "race_level": f.get("RaceLevel", "N/A"),
                "candidate": f.get("Candidate", ""),
                "party": f.get("Party", ""),
                "claim_date": f.get("ClaimDate"),
                "date_checked": f.get("DateChecked"),
            }
        )
    out.sort(key=lambda x: x.get("date_checked") or "", reverse=True)
    return out[:limit]


# --- Claim Tips (fact-check intake queue) --------------------------
def new_claim_tips() -> list[dict[str, Any]]:
    """Tips with Status == 'New' -> {item_id, claim_text, source_url,
    submitted_by, state, lga}."""
    rows = _list_items(
        config.LIST_CLAIMTIPS,
        {
            "$expand": "fields",
            "$select": "id",
            "$top": "200",
        },
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        f = row.get("fields", {})
        if (f.get("Status") or "New") != "New":
            continue
        out.append(
            {
                "item_id": row["id"],
                "claim_text": (f.get("ClaimText") or "").split(SCREENSHOT_MARK)[0].strip(),
                "source_url": (f.get("SourceUrl") or "").strip(),
                "submitted_by": (f.get("SubmittedBy") or "").strip(),
                "state": (f.get("State") or "").strip(),
                "lga": (f.get("LGA") or "").strip(),
            }
        )
    return out


def mark_tip_status(item_id: str, status: str) -> None:
    with _client() as c:
        c.patch(
            f"/sites/{site_id()}/lists/{config.LIST_CLAIMTIPS}/items/{item_id}/fields",
            json={"Status": status},
        ).raise_for_status()


# --- Fact Checks -----------------------------------------------------
def existing_claim_keys() -> set[str]:
    """All ClaimKeys currently in Fact Checks, for dedup."""
    rows = _list_items(
        config.LIST_FACTCHECKS,
        {
            "$expand": "fields($select=ClaimKey)",
            "$select": "id",
            "$top": "2000",
            "$orderby": "lastModifiedDateTime desc",
        },
    )
    return {
        (r.get("fields", {}).get("ClaimKey") or "").strip()
        for r in rows
        if r.get("fields", {}).get("ClaimKey")
    }


def recent_claims_for_dedup() -> list[tuple[str, str, str]]:
    """(State, LGA, Claim) for every Fact Checks row — for near-dup matching
    against a resurfacing claim (same idea as recent_items_for_dedup)."""
    rows = _list_items(
        config.LIST_FACTCHECKS,
        {"$expand": "fields($select=Claim,State,LGA)", "$select": "id", "$top": "999"},
    )
    out = []
    for r in rows:
        f = r.get("fields", {})
        if f.get("Claim"):
            out.append((f.get("State") or "", f.get("LGA") or "", f["Claim"]))
    return out


def create_fact_check(item: dict[str, Any]) -> str:
    fields = {
        "Title": item["headline"][:255],
        "Claim": item["claim"],
        "Verdict": item["verdict"],
        "Evidence": item["evidence"],
        "SourceUrl": item.get("source_url", "")[:255],
        "SourceName": item.get("source_name", "")[:255],
        "Category": item["category"],
        "State": item.get("state", "")[:255],
        "LGA": item.get("lga", "")[:255],
        "RaceLevel": item.get("race_level", "N/A"),
        "Candidate": item.get("candidate", "")[:255],
        "Party": item.get("party", "")[:255],
        "Status": "Needs review",
        "SubmittedBy": item.get("submitted_by", "")[:255],
        "SubmittedVia": item.get("submitted_via", "Web form"),
        "ClaimKey": item["claim_key"][:255],
        "Confidence": int(item["confidence"]),
        "ClaimDate": item.get("claim_date") or _utcnow(),
        "DateChecked": _utcnow(),
    }
    url = f"/sites/{site_id()}/lists/{config.LIST_FACTCHECKS}/items"
    last = None
    for attempt in range(3):
        with _client() as c:
            r = c.post(url, json={"fields": fields})
        if r.status_code < 300:
            return r.json()["id"]
        last = r
        if r.status_code not in (429, 500, 503):
            break
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(
        f"create_fact_check {last.status_code}: {last.text[:400]}" if last is not None else "no response"
    )


# --- helpers ------------------------------------------------------
def _utcnow() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


