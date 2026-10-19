"""Collapse near-duplicate stories.

The same event gets reported by many outlets, so ArticleKey (URL hash) dedup
isn't enough. Two stories are "the same" when they're about the same LGA and
their headlines share most of their significant words.
"""
from __future__ import annotations

import re

_STOP = set(
    """
    a an the of in on at to for and or but with from by as is are was were be been
    being this that these those it its his her their they them he she who whom which
    what when where after before during over under into out up down off not new old
    more most other some has have had will would can could says say said report reports
    reported lga state nigeria nigerian govt government local council area community
    communities residents people man woman men women boy girl year years old
    """.split()
)


def _stem(t: str) -> str:
    for suf in ("ational", "ation", " largest", " ments", "ment", "ings", "ing", "ies", "ers",
                "er", "ed", "es", "s"):
        if t.endswith(suf) and len(t) - len(suf) >= 4:
            return t[: -len(suf)]
    return t


def sig_tokens(text: str) -> set[str]:
    toks = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {_stem(t) for t in toks if len(t) > 3 and t not in _STOP}


class Deduper:
    """Feed it (lga, headline) pairs; ask whether the next one is a repeat."""

    def __init__(self) -> None:
        self._seen: list[tuple[str, set[str]]] = []

    def seed(self, pairs) -> None:
        for lga, headline in pairs:
            self._seen.append(((lga or "").strip().lower(), sig_tokens(headline)))

    def is_dup(self, lga: str, headline: str, threshold: float = 0.5) -> bool:
        new = sig_tokens(headline)
        if not new:
            return False
        ll = (lga or "").strip().lower()
        for o_lga, o_toks in self._seen:
            if o_lga != ll or not o_toks:
                continue
            inter = len(new & o_toks)
            if inter >= 3 or (inter and inter / len(new | o_toks) >= threshold):
                return True
        return False

    def add(self, lga: str, headline: str) -> None:
        self._seen.append(((lga or "").strip().lower(), sig_tokens(headline)))
