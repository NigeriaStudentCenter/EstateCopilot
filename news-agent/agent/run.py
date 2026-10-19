"""Orchestrator: poll every active source, classify, write new items to News.

Run locally:   python -m agent.run
Dry run:       python -m agent.run --dry-run
One source:    python -m agent.run --only "Google News — Lagos"
"""
from __future__ import annotations

import argparse
import sys
import time
import traceback

from . import config, graph
from .cache import Cache
from .classify import classify
from .dedup import Deduper
from .fetchers import article_key, fetch


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="classify but do not write to SharePoint")
    ap.add_argument("--only", help="run just the source whose name contains this text")
    ap.add_argument("--limit-sources", type=int, default=0, help="stop after N sources (debugging)")
    ap.add_argument("--no-cache", action="store_true", help="ignore the local classification cache")
    args = ap.parse_args(argv)

    t0 = time.time()
    sources = graph.active_sources()
    if args.only:
        sources = [s for s in sources if args.only.lower() in s["name"].lower()]
    if args.limit_sources:
        sources = sources[: args.limit_sources]
    if not sources:
        print("no matching active sources")
        return 1

    cache = Cache(enabled=not args.no_cache)
    seen_keys = graph.existing_article_keys()
    deduper = Deduper()
    try:
        recent = graph.recent_items_for_dedup()
        deduper.seed(recent)
    except Exception as e:
        recent = []
        print(f"  (dedup seed skipped: {e})")
    print(
        f"{len(sources)} sources · {len(seen_keys)} article keys, "
        f"{len(recent)} recent headlines already in News"
    )

    if cache.enabled:
        print(f"classification cache: {len(cache)} entries")

    totals = {
        "candidates": 0, "classified": 0, "cached": 0, "kept": 0,
        "written": 0, "dupes": 0, "near_dupes": 0,
    }

    for src in sources:
        added_this_source = 0
        note = ""
        try:
            candidates = fetch(src)
        except Exception as e:
            note = f"FETCH FAILED: {e}"
            print(f"  {src['name']:32} {note}")
            if not args.dry_run:
                graph.mark_source_polled(src["item_id"], note)
            continue

        totals["candidates"] += len(candidates)
        for cand in candidates:
            key = article_key(cand["link"])
            if key in seen_keys:
                totals["dupes"] += 1
                continue
            hit, rec = cache.get(key)
            if hit:
                totals["cached"] += 1
            else:
                try:
                    rec = classify(cand)
                except Exception as e:
                    print(f"    ! classify error: {e}")
                    continue
                totals["classified"] += 1
                cache.put(key, rec)
            if rec is None:
                continue
            if rec["relevance"] < config.MIN_RELEVANCE:
                continue
            if deduper.is_dup(rec["lga"], rec["headline"]):
                totals["near_dupes"] += 1
                if args.dry_run:
                    print(f"    ~ near-dup, skipped: [{rec['lga']}] {rec['headline']}")
                continue
            deduper.add(rec["lga"], rec["headline"])
            totals["kept"] += 1

            item = {
                **rec,
                "url": cand["link"],
                "source_name": cand["source_name"],
                "article_key": key,
            }
            if args.dry_run:
                print(
                    f"    + [{rec['state']} / {rec['lga']}] ({rec['relevance']}) "
                    f"{rec['category']} — {rec['headline']}"
                )
                if rec.get("lga_evidence"):
                    print(f"        evidence: “{rec['lga_evidence']}”")
            else:
                try:
                    graph.create_news_item(item)
                    totals["written"] += 1
                except Exception as e:
                    print(f"    ! write error: {e}")
                    continue
            seen_keys.add(key)
            added_this_source += 1

        note = (
            f"{len(candidates)} candidates, {added_this_source} new "
            f"({'dry-run' if args.dry_run else 'written'})"
        )
        print(f"  {src['name']:32} {note}")
        cache.flush()
        if not args.dry_run:
            try:
                graph.mark_source_polled(src["item_id"], note)
            except Exception as e:
                print(f"    ! mark_source_polled error: {e}")

    cache.flush()
    dt = time.time() - t0
    print(
        f"\ndone in {dt:.0f}s — candidates {totals['candidates']}, "
        f"url-dupes {totals['dupes']}, near-dupes {totals['near_dupes']}, "
        f"cached {totals['cached']}, classified {totals['classified']}, "
        f"kept {totals['kept']}, written {totals['written']}"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(2)
