"""Classify-only smoke test — needs ONLY ANTHROPIC_API_KEY.

Fetches a few live headlines (no SharePoint, no Graph) and runs them through
the classifier so you can eyeball the LGA / category / relevance calls before
the Graph secret is wired up.

    export ANTHROPIC_API_KEY=sk-ant-...
    python scripts/try_classify.py
    python scripts/try_classify.py "Kano"      # different state search
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# config.py requires these at import time; classify never actually uses Graph.
os.environ.setdefault("GRAPH_TENANT_ID", "unused")
os.environ.setdefault("GRAPH_CLIENT_ID", "unused")
os.environ.setdefault("GRAPH_CLIENT_SECRET", "unused")

if not os.environ.get("ANTHROPIC_API_KEY"):
    sys.exit("set ANTHROPIC_API_KEY first:  export ANTHROPIC_API_KEY=sk-ant-...")

from agent.classify import classify  # noqa: E402
from agent.fetchers import fetch  # noqa: E402

state = sys.argv[1] if len(sys.argv) > 1 else "Lagos"
query = (
    f'https://news.google.com/rss/search?q="{state} State" '
    f'(LGA OR "local government" OR council OR chairman OR community)'
    f"&hl=en-NG&gl=NG&ceid=NG:en"
)
source = {
    "name": f"Google News — {state}",
    "type": "Search",
    "url": query,
    "state": state,
    "lga": "",
    "selector": "",
}

cands = fetch(source)
print(f"{len(cands)} candidates from {source['name']}\n" + "=" * 70)

kept = 0
for c in cands:
    print(f"\nTITLE: {c['title']}")
    print(f"  body: {len(c.get('body') or '')} chars   link: {c['link'][:80]}")
    try:
        rec = classify(c)
    except Exception as e:
        print(f"  ! classify error: {e}")
        continue
    if rec is None:
        print("  -> dropped (not specific LGA news / no verified LGA evidence)")
        continue
    kept += 1
    print(
        f"  -> [{rec['state']} / {rec['lga']}]  rel={rec['relevance']}  {rec['category']}\n"
        f"     {rec['headline']}\n"
        f"     evidence: “{rec['lga_evidence']}”\n"
        f"     {rec['summary']}"
    )

print("\n" + "=" * 70)
print(f"kept {kept} / {len(cands)}  (MIN_RELEVANCE gate applied separately in run.py)")
