"""Create ONE News item via the real code path and delete it. Confirms the
SourceUrl column exists and writes succeed before a full run.

    PYTHONPATH=. ~/news-agent-venv/bin/python scripts/test_write.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import config, graph  # noqa: E402

item = {
    "headline": "TEST — delete me (scripts/test_write.py)",
    "lga": "Alimosho",
    "state": "Lagos",
    "summary": "Probe row to confirm SourceUrl is writable.",
    "category": "Security",
    "event_date": "2026-08-30T00:00:00Z",
    "url": "https://example.com/probe",
    "source_name": "test",
    "article_key": "testkey0000000000test",
    "relevance": 80,
}

try:
    new_id = graph.create_news_item(item)
    print(f"OK — wrote item id {new_id}, deleting it")
    with graph._client() as c:
        c.delete(f"/sites/{graph.site_id()}/lists/{config.LIST_NEWS}/items/{new_id}")
    print("clean — full run is good to go")
except Exception as e:
    print("FAILED:", e)
    print("\nIf this says a 500/field error, the SourceUrl column isn't there yet:")
    print("  News list -> + Add column -> Single line of text -> name it exactly  SourceUrl")
