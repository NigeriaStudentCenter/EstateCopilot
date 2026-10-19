"""Collapse resurfacing claims onto the fact-check that already covers them.

Same technique as agent/dedup.py's story deduper (stemmed significant-word
overlap), but scoped to (state, lga) so "the same rumour, different LGA" is
still treated as a fresh claim worth its own local evidence check.
"""
from __future__ import annotations

import re

_STOP = set(
    """
    a an the of in on at to for and or but with from by as is are was were be been
    being this that these those it its his her their they them he she who whom which
    what when where after before during over under into out up down off not new old
    more most other some has have had will would can could says say said claim claims
    claimed alleged allegedly reportedly report reports reported viral video photo
    image post shared social media whatsapp facebook twitter nigeria nigerian
    """.split()
)


def _stem(t: str) -> str:
    for suf in ("ational", "ation", "ments", "ment", "ings", "ing", "ies", "ers",
                "er", "ed", "es", "s"):
        if t.endswith(suf) and len(t) - len(suf) >= 4:
            return t[: -len(suf)]
    return t


def sig_tokens(text: str) -> set[str]:
    toks = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {_stem(t) for t in toks if len(t) > 3 and t not in _STOP}


class ClaimDeduper:
    """Feed it (state, lga, claim_text) triples already checked; ask whether a
    new claim is the same one resurfacing."""

    def __init__(self) -> None:
        self._seen: list[tuple[str, str, set[str], str]] = []

    def seed(self, triples) -> None:
        for state, lga, claim in triples:
            self._seen.append(
                ((state or "").strip().lower(), (lga or "").strip().lower(), sig_tokens(claim), claim)
            )

    def match(self, state: str, lga: str, claim: str, threshold: float = 0.55) -> str | None:
        """Returns the prior claim text it matches, or None if this looks new."""
        new = sig_tokens(claim)
        if not new:
            return None
        s, l = (state or "").strip().lower(), (lga or "").strip().lower()
        for o_state, o_lga, o_toks, o_claim in self._seen:
            if not o_toks:
                continue
            if o_state and s and o_state != s:
                continue
            if o_lga and l and o_lga != l:
                continue
            inter = len(new & o_toks)
            if inter >= 4 or (inter and inter / len(new | o_toks) >= threshold):
                return o_claim
        return None

    def add(self, state: str, lga: str, claim: str) -> None:
        self._seen.append(
            ((state or "").strip().lower(), (lga or "").strip().lower(), sig_tokens(claim), claim)
        )
