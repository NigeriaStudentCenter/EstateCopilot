"""One-off: repair the 4 broken rows in the News Sources list.

  Sahara Reporters / Nigerian Tribune -> corrected RSS URLs
  The Cable / The Guardian Nigeria     -> Cloudflare-walled, switch to a
                                          Google News site: search

    PYTHONPATH=. ~/news-agent-venv/bin/python scripts/fix_sources.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import config, graph  # noqa: E402

GN = "https://news.google.com/rss/search?q={q}&hl=en-NG&gl=NG&ceid=NG:en"

FIXES = {
    "Sahara Reporters": {
        "Source_x0020_type": "RSS",
        "URL_x0020_or_x0020_query": "https://saharareporters.com/rss.xml",
    },
    "Nigerian Tribune": {
        "Source_x0020_type": "RSS",
        "URL_x0020_or_x0020_query": "https://tribuneonlineng.com/feed/",
    },
    "The Cable": {
        "Source_x0020_type": "Search",
        "URL_x0020_or_x0020_query": GN.format(
            q="site:thecable.ng (LGA OR \"local government\" OR council OR chairman OR community) when:3d"
        ),
    },
    "The Guardian Nigeria": {
        "Source_x0020_type": "Search",
        "URL_x0020_or_x0020_query": GN.format(
            q="site:guardian.ng (LGA OR \"local government\" OR council OR chairman OR community) when:3d"
        ),
    },
}


def main() -> int:
    rows = graph._list_items(
        config.LIST_SOURCES, {"$expand": "fields($select=Title)", "$select": "id", "$top": "200"}
    )
    by_name = {r.get("fields", {}).get("Title", ""): r["id"] for r in rows}
    with graph._client() as c:
        for name, patch in FIXES.items():
            item_id = by_name.get(name)
            if not item_id:
                print(f"  ! not found: {name}")
                continue
            r = c.patch(
                f"/sites/{graph.site_id()}/lists/{config.LIST_SOURCES}/items/{item_id}/fields",
                json=patch,
            )
            r.raise_for_status()
            print(f"  fixed: {name:22} -> {patch['Source_x0020_type']:6} {patch['URL_x0020_or_x0020_query'][:70]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
