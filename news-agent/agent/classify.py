"""Claude turns a raw candidate article into a structured News record.

One tool call per article, tool_choice forced, so the output is always a
typed object. The model must quote verbatim evidence for the LGA it picks;
_validate() rejects the record if that quote isn't actually in the text we
sent, which stops the model guessing an LGA from a bare place name.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import anthropic

from . import config

_client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)


@lru_cache(maxsize=1)
def _lga_index() -> dict[str, list[str]]:
    data = json.loads((Path(__file__).with_name("lgas.json")).read_text())
    return data["states"]


@lru_cache(maxsize=1)
def _lga_reference_text() -> str:
    lines = []
    for state, lgas in _lga_index().items():
        lines.append(f"{state}: " + ", ".join(lgas))
    return "\n".join(lines)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (s or "").lower())


_TOOL = {
    "name": "record_article",
    "description": "Record the structured assessment of one news article.",
    "input_schema": {
        "type": "object",
        "properties": {
            "is_local_government_news": {
                "type": "boolean",
                "description": "True ONLY if the text explicitly locates the story in one "
                "specific Nigerian Local Government Area (LGA): its council, chairman, a named "
                "town/ward in it, a project or incident at a stated location. Generic "
                "state-wide or national politics = false. If you are guessing the LGA from a "
                "place name you are not sure about, set this false.",
            },
            "state": {
                "type": "string",
                "description": "The Nigerian state (exact name from the reference list), or '' if unclear.",
            },
            "lga": {
                "type": "string",
                "description": "The single LGA the story is primarily about, spelled EXACTLY "
                "as in the reference list for that state. '' if it cannot be pinned to one LGA.",
            },
            "lga_evidence": {
                "type": "string",
                "description": "A short VERBATIM quote (copied exactly, <=120 chars) from the "
                "SNIPPET or ARTICLE text that identifies the LGA - e.g. a sentence naming the "
                "LGA, its council, its chairman, or a town explicitly said to be in it. Must "
                "be an exact substring of the text provided. '' if the text contains no such "
                "phrase (in which case set is_local_government_news=false).",
            },
            "headline": {
                "type": "string",
                "description": "A clean, factual headline, <= 140 chars. Rewrite clickbait plainly.",
            },
            "summary": {
                "type": "string",
                "description": "2-3 sentence neutral summary of what happened, who is involved, and where.",
            },
            "category": {"type": "string", "enum": config.CATEGORIES},
            "event_date": {
                "type": "string",
                "description": "ISO date (YYYY-MM-DD) the event happened if stated, else ''.",
            },
            "relevance": {
                "type": "integer",
                "description": "0-100. How useful is this to residents/ambassadors of that LGA "
                "as local news? 80+ = concrete local development/security/service news; 40-60 = "
                "tangential mention; <30 = not really local.",
            },
        },
        "required": [
            "is_local_government_news",
            "state",
            "lga",
            "lga_evidence",
            "headline",
            "summary",
            "category",
            "event_date",
            "relevance",
        ],
    },
}

_SYSTEM = (
    "You classify Nigerian news articles for a per-Local-Government-Area news feed. "
    "You are precise about which LGA a story belongs to and you NEVER invent or guess "
    "an LGA name. Use ONLY the exact LGA spellings from the reference list. Assign an "
    "LGA only when the provided text explicitly supports it and you can quote the "
    "phrase that does so. If a story spans a whole state or the nation, or you would "
    "have to guess, set is_local_government_news=false. When two LGAs share a name "
    "across states, use the state context to choose. Prefer the LGA where the event "
    "physically happened over an LGA merely quoted by an official.\n\n"
    "A Federal Constituency, a Senatorial District, a 'political bloc' or an "
    "Emirate is NOT an LGA - do not treat a mention of one as locating the story "
    "in an LGA. A person merely 'hailing from', having 'ancestral roots in', or "
    "being an 'indigene of' an LGA does NOT make the story local news for that "
    "LGA; the event itself must happen there or concern that LGA's council, "
    "services or communities.\n\n"
    "REFERENCE - Nigerian states and their LGAs:\n" + _lga_reference_text()
)


def classify(candidate: dict[str, Any]) -> dict[str, Any] | None:
    scope = (candidate.get("hint_scope") or "").strip()

    hint = ""
    if candidate.get("hint_state"):
        hint = f"\n\n(Source hint: this feed tracks {candidate['hint_state']} State"
        if candidate.get("hint_lga"):
            hint += f", {candidate['hint_lga']} LGA"
        hint += ". Use only as a weak prior - the text still has to support the LGA.)"
    if scope.lower() in ("national", "state-wide", "state wide", "statewide"):
        hint += (
            f"\n\n(This source is tagged '{scope}' scope - it's expected to carry "
            "national or state-level news, not LGA-pinned stories. Still fill in "
            "state/headline/summary/category/relevance normally; only set "
            "is_local_government_news=true if the text actually pins this to one LGA.)"
        )

    body = (candidate.get("body") or "").strip()
    body_block = f"\nARTICLE:\n{body}\n" if body else "\nARTICLE: (body unavailable - judge from title + snippet only)\n"

    user = (
        f"SOURCE: {candidate['source_name']}\n"
        f"TITLE: {candidate['title']}\n"
        f"PUBLISHED: {candidate.get('published') or 'unknown'}\n"
        f"SNIPPET: {candidate.get('snippet') or '(none)'}\n"
        f"{body_block}"
        f"URL: {candidate['link']}{hint}\n\n"
        "Call record_article with your assessment."
    )

    try:
        msg = _client.messages.create(
            model=config.MODEL,
            max_tokens=900,
            system=_SYSTEM,
            tools=[_TOOL],
            tool_choice={"type": "tool", "name": "record_article"},
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.APIError as e:
        raise RuntimeError(f"anthropic error: {e}") from e

    for block in msg.content:
        if block.type == "tool_use" and block.name == "record_article":
            return _validate(block.input, candidate, scope)
    return None


_WIDE_SCOPES = {"national", "state-wide", "state wide", "statewide"}


def _validate(
    data: dict[str, Any], candidate: dict[str, Any], scope: str = ""
) -> dict[str, Any] | None:
    is_local = bool(data.get("is_local_government_news"))
    state = (data.get("state") or "").strip()
    lga = (data.get("lga") or "").strip()
    evidence = (data.get("lga_evidence") or "").strip()
    is_wide_scope = scope.strip().lower() in _WIDE_SCOPES

    if is_local:
        if not state or not lga or not evidence:
            return None

        ref = _lga_index().get(state)
        if not ref:
            return None
        if lga not in ref:
            match = next((x for x in ref if x.lower() == lga.lower()), None)
            if not match:
                return None
            lga = match

        # the evidence quote must really be in what we sent the model
        haystack = _norm(
            " ".join(
                [
                    candidate.get("title", ""),
                    candidate.get("snippet", ""),
                    candidate.get("body", ""),
                ]
            )
        )
        ev_n = _norm(evidence)
        if not ev_n or ev_n not in haystack:
            return None

        # the quote must actually locate the story in THIS lga: either it names the
        # lga (a distinctive token, not the state name or a bare direction word), or
        # it carries an explicit local-government marker.
        _GENERIC = {"area", "local", "government", "council", "north", "south", "east", "west", "central", "municipal"}
        state_tokens = set(_norm(state).split())
        lga_tokens = [
            t for t in _norm(lga).split()
            if len(t) > 3 and t not in state_tokens and t not in _GENERIC
        ]
        names_lga = any(t in ev_n for t in lga_tokens)
        _STRONG = ("local government", "council area", "council ward", " lga", "lga ", "lga.", "lga,",
                   "council chairman", "the council")
        has_marker = any(m in ev_n for m in _STRONG) or "chairman of" in ev_n
        if not (names_lga or has_marker):
            return None
        # a constituency / district / ancestry mention is NOT enough on its own -
        # those overlap LGAs but aren't one, and "hails from" isn't the story
        # happening there. Require an explicit LGA marker in that case.
        _WEAK = ("federal constituency", "senatorial district", "senatorial zone", "senatorial",
                 "political bloc", "ancestral", "hails from", "indigene of", "hometown", "country home")
        if any(w in ev_n for w in _WEAK) and not any(s in ev_n for s in _STRONG):
            return None
    elif is_wide_scope:
        # This source is explicitly tagged National / State-wide: a story that
        # doesn't pin to one LGA is still the expected, wanted output here -
        # don't drop it, just carry it with no LGA attached.
        if scope.strip().lower() == "national":
            state = state or "National"
        else:  # State-wide - need to know which state
            state = state or (candidate.get("hint_state") or "").strip()
            if not state:
                return None
        lga = ""
        evidence = ""
    else:
        # not local, and this source isn't tagged as wide-scope - not our feed's job.
        return None

    if data.get("category") not in config.CATEGORIES:
        data["category"] = "Other"
    try:
        rel = int(data.get("relevance", 0))
    except (TypeError, ValueError):
        rel = 0
    ev = (data.get("event_date") or "").strip()
    return {
        "headline": (data.get("headline") or candidate["title"])[:255],
        "summary": (data.get("summary") or candidate.get("snippet") or "").strip(),
        "state": state,
        "lga": lga,
        "category": data["category"],
        "event_date": f"{ev}T00:00:00Z" if len(ev) == 10 else None,
        "relevance": max(0, min(100, rel)),
        "lga_evidence": evidence[:250],
    }
