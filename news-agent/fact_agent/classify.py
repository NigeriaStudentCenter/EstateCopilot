"""Claude verifies one claim end-to-end: search the web for evidence, then
record a structured verdict via a forced tool call.

Same anti-hallucination discipline as agent/classify.py's LGA pinning: the
model must produce a verbatim quote from a real source it actually found via
web_search, and a real URL for that source. It is never allowed to invent a
citation. tool_choice can't be forced on turn one (the model has to search
first), so this runs a bounded loop: let it search freely, resume any
pause_turn the way Anthropic's web_search tool expects, then nudge it to
call record_fact_check once it has enough to decide - forcing that tool on
the final round so the loop always terminates with a structured result.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

import anthropic

from agent import config

_client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)

_MAX_ROUNDS = 6

_WEB_SEARCH_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": config.FACT_WEB_SEARCH_MAX_USES,
}

_TOOL = {
    "name": "record_fact_check",
    "description": "Record the structured, evidence-backed verdict for one claim.",
    "input_schema": {
        "type": "object",
        "properties": {
            "claim": {
                "type": "string",
                "description": "The specific, checkable claim being assessed, cleaned up into "
                "one plain factual statement (not a question, not the submitter's wording if "
                "it was vague - restate precisely what is being claimed).",
            },
            "headline": {
                "type": "string",
                "description": "A short, neutral headline for this fact-check, <= 140 chars, "
                "e.g. 'No, the CBN did not ban all foreign currency transactions'.",
            },
            "verdict": {"type": "string", "enum": config.VERDICTS},
            "confidence": {
                "type": "integer",
                "description": "0-100. How confident are you in this verdict given the evidence "
                "you found? Low confidence (<40) is expected and correct for Unverifiable claims.",
            },
            "evidence": {
                "type": "string",
                "description": "A VERBATIM quote (<=300 chars) copied exactly from a real source "
                "you found via web_search, that supports the verdict. If verdict is "
                "'Unverifiable', explain in your own words what you searched for and why no "
                "reliable source confirms or denies it instead - do not invent a quote.",
            },
            "source_url": {
                "type": "string",
                "description": "The exact URL of the source the evidence quote came from, "
                "copied from an actual web_search result. '' only if verdict is Unverifiable "
                "and you found nothing worth citing.",
            },
            "source_name": {
                "type": "string",
                "description": "The publisher/outlet name for source_url, e.g. 'Premium Times', "
                "'Central Bank of Nigeria', 'Reuters'. '' if source_url is ''.",
            },
            "category": {"type": "string", "enum": config.FACT_CATEGORIES},
            "state": {
                "type": "string",
                "description": "Nigerian state this claim is specifically about, if any. '' if "
                "the claim is national or not Nigeria-specific.",
            },
            "lga": {
                "type": "string",
                "description": "Local Government Area this claim is specifically about, if the "
                "claim names one explicitly. '' otherwise - never guess one.",
            },
            "race_level": {
                "type": "string",
                "enum": config.RACE_LEVELS,
                "description": "Which race this claim concerns, if it's election-related: "
                "'Presidential / General Election' for national/presidential races, 'Senate' or "
                "'House of Representatives' for National Assembly seats, 'Governorship' for a "
                "state governor race, 'Local Government' for LG chairman/councillor races. "
                "'N/A' for anything not about an election, a candidate, or the electoral process "
                "(INEC announcements, voter registration, election dates/postponement, and "
                "candidate eligibility/credential disputes all count as election-related even "
                "before voting happens).",
            },
            "candidate": {
                "type": "string",
                "description": "The candidate or office-holder this claim is about, if named. "
                "'' if none, or if the claim isn't about a specific person.",
            },
            "party": {
                "type": "string",
                "description": "The candidate's political party if stated or verifiable, else ''. "
                "Never guess a party affiliation you didn't find evidence for.",
            },
            "claim_date": {
                "type": "string",
                "description": "ISO date (YYYY-MM-DD) the claim itself refers to or started "
                "circulating, if known, else ''.",
            },
        },
        "required": [
            "claim", "headline", "verdict", "confidence", "evidence", "source_url",
            "source_name", "category", "state", "lga", "race_level", "candidate",
            "party", "claim_date",
        ],
    },
}

_SYSTEM = (
    "You are a non-partisan fact-checker verifying claims circulating in or about Nigeria, "
    "held to the IFCN Code of Principles: non-partisan and fair, transparent about sources and "
    "methods, and evidence-based - you let what you find dictate the verdict, not the other way "
    "round. You do not advocate or take policy positions.\n\n"
    "For every claim: use web_search to find current, reliable evidence - official statements, "
    "established news outlets, primary/government data, or prior work from recognised "
    "fact-checkers (Dubawa, Africa Check, FactCheckHub, Reuters Fact Check, AFP Fact Check). "
    "Prefer primary sources over aggregators. Search enough to be confident, but do not pad - "
    "stop once you have a clear answer or have genuinely exhausted what's findable.\n\n"
    "You must NEVER invent a quote or a URL. The 'evidence' you record must be copied verbatim "
    "from a real page web_search actually returned, and 'source_url' must be that page's real "
    "URL. If you cannot find enough to confirm or deny the claim, the honest answer is "
    "verdict='Unverifiable' with low confidence - that is a correct, useful output, not a "
    "failure.\n\n"
    "Verdict guide: True = the core factual claim checks out. False = it is contradicted by "
    "reliable evidence. Misleading = technically not false but presented in a way that distorts "
    "the truth (cherry-picked stats, false cause-effect, old footage passed off as current). "
    "Needs Context = true but missing context that materially changes how it should be read. "
    "Satire = originates from a known parody/satire source and isn't meant to be taken literally. "
    "Unverifiable = no reliable source confirms or denies it either way.\n\n"
    "ELECTIONS: check claims about Nigerian elections at every level - Presidential/General, "
    "Senate, House of Representatives, Governorship, and Local Government (chairman/councillor) "
    "races - starting now, well before any vote happens. Pre-election claims are still fully "
    "checkable and matter just as much as results: a candidate's claimed achievements in office "
    "('built 40 boreholes', 'as commissioner I...'), academic credentials and certificates, age "
    "and eligibility disputes, criminal-record or indictment claims, defection/party claims, "
    "endorsement claims ('X has stepped down for Y'), INEC statements, voter registration rules, "
    "and election-date/postponement rumours are all in scope - verify each against the "
    "candidate's or party's actual record, INEC's official statements, and reputable reporting, "
    "exactly as rigorously as any other claim. A campaign PROMISE about the future ('I will build "
    "20 hospitals') is not itself fact-checkable - if that's all a claim contains, verdict is "
    "Unverifiable with a note that promises aren't checkable, only their record and stated facts "
    "are. When a claim is election-related, always set race_level (never 'N/A' for it) and name "
    "the candidate/party when the claim identifies one - but never guess a race level, candidate "
    "or party the claim doesn't actually support.\n\n"
    "When you have gathered enough evidence, call record_fact_check with your final structured "
    "assessment. Do not answer in plain prose - the tool call is the only output that matters."
)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def claim_key(claim_text: str) -> str:
    return hashlib.sha1(_norm(claim_text).encode("utf-8")).hexdigest()[:20] or "empty"


def classify(tip: dict[str, Any]) -> dict[str, Any] | None:
    ctx = [f"CLAIM TO VERIFY: {tip['claim_text']}"]
    if tip.get("source_url"):
        ctx.append(f"WHERE IT WAS SEEN: {tip['source_url']}")
    if tip.get("state") or tip.get("lga"):
        loc = ", ".join(x for x in (tip.get("lga"), tip.get("state")) if x)
        ctx.append(f"LOCATION HINT (weak prior - verify, don't assume): {loc}")
    ctx.append("\nResearch this with web_search, then call record_fact_check.")
    user = "\n".join(ctx)

    messages: list[dict[str, Any]] = [{"role": "user", "content": user}]
    tools = [_WEB_SEARCH_TOOL, _TOOL]

    for round_i in range(_MAX_ROUNDS):
        force_final = round_i == _MAX_ROUNDS - 1
        try:
            resp = _client.messages.create(
                model=config.FACT_MODEL,
                max_tokens=2000,
                system=_SYSTEM,
                tools=tools,
                tool_choice={"type": "tool", "name": "record_fact_check"}
                if force_final
                else {"type": "auto"},
                messages=messages,
            )
        except anthropic.APIError as e:
            raise RuntimeError(f"anthropic error: {e}") from e

        messages.append({"role": "assistant", "content": resp.content})

        for block in resp.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "record_fact_check":
                return _validate(block.input, tip)

        if resp.stop_reason == "pause_turn":
            continue  # long search - resume with the same (now longer) transcript

        if resp.stop_reason in ("end_turn", "max_tokens", "stop_sequence"):
            messages.append(
                {
                    "role": "user",
                    "content": "Call record_fact_check now with your final assessment based on "
                    "what you found.",
                }
            )
            continue

    return None


def _validate(data: dict[str, Any], tip: dict[str, Any]) -> dict[str, Any] | None:
    claim = (data.get("claim") or tip.get("claim_text") or "").strip()
    verdict = (data.get("verdict") or "").strip()
    evidence = (data.get("evidence") or "").strip()
    if not claim or verdict not in config.VERDICTS or not evidence:
        return None

    source_url = (data.get("source_url") or "").strip()
    if verdict != "Unverifiable" and not source_url:
        # every non-Unverifiable verdict must point at a real source
        return None

    category = data.get("category") if data.get("category") in config.FACT_CATEGORIES else "Other"
    try:
        confidence = int(data.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0
    confidence = max(0, min(100, confidence))

    race_level = data.get("race_level") if data.get("race_level") in config.RACE_LEVELS else "N/A"
    claim_date = (data.get("claim_date") or "").strip()
    return {
        "claim": claim[:2000],
        "headline": (data.get("headline") or claim)[:255],
        "verdict": verdict,
        "confidence": confidence,
        "evidence": evidence[:2000],
        "source_url": source_url[:255],
        "source_name": (data.get("source_name") or "").strip()[:255],
        "category": category,
        "state": (data.get("state") or tip.get("state") or "").strip(),
        "lga": (data.get("lga") or "").strip(),
        "race_level": race_level,
        "candidate": (data.get("candidate") or "").strip()[:255],
        "party": (data.get("party") or "").strip()[:255],
        "claim_date": f"{claim_date}T00:00:00Z" if len(claim_date) == 10 else None,
        "claim_key": claim_key(claim),
        "submitted_by": tip.get("submitted_by", ""),
        "submitted_via": tip.get("submitted_via", "Web form"),
    }
