"""Click counts for links in NSA TV, so we can see which ones people use.

Each event is one line appended to a daily append blob in the app's storage
(appends are atomic, so concurrent instances never lose a count):
    shared-cache/clicks/2026-10-30.log   "<unix ts>\t<event>\t<src>\n"
Events are "view" (NSA TV opened) and "go:<key>" (a tracked link tapped).
"""

from __future__ import annotations

import datetime as dt
import logging
import time
from collections import Counter

from agent import shared_cache


def _blob(day: dt.date):
    c = shared_cache._container()
    return c.get_blob_client(f"clicks/{day.isoformat()}.log") if c else None


def record(event: str, src: str = "") -> None:
    b = _blob(dt.datetime.now(dt.timezone.utc).date())
    if not b:
        return
    line = f"{int(time.time())}\t{event[:40]}\t{src[:20]}\n".encode()
    try:
        try:
            b.append_block(line, timeout=3)
        except Exception:
            b.create_append_blob(timeout=3)  # first event of the day
            b.append_block(line, timeout=3)
    except Exception:
        logging.warning("clicks: record failed", exc_info=True)


def counts(days: int = 7) -> dict[str, dict[str, int]]:
    """{day: {"event src": n}} for the last `days` days (UTC)."""
    out = {}
    today = dt.datetime.now(dt.timezone.utc).date()
    for k in range(days):
        day = today - dt.timedelta(days=k)
        b = _blob(day)
        try:
            text = b.download_blob(timeout=5).readall().decode() if b else ""
        except Exception:
            continue
        c = Counter(" ".join(line.split("\t")[1:3]).strip() for line in text.splitlines() if line)
        out[day.isoformat()] = dict(c)
    return out
