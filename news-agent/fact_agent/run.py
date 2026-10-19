"""Orchestrator: pull new Claim Tips, verify each, write verdicts to Fact
Checks as 'Needs review'.

Run locally:   python -m fact_agent.run
Dry run:       python -m fact_agent.run --dry-run
"""
from __future__ import annotations

import argparse
import sys
import time
import traceback

from agent import config, graph

from .classify import classify
from .dedup import ClaimDeduper


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="classify but do not write / mark tips")
    ap.add_argument("--limit", type=int, default=0, help="stop after N tips (debugging)")
    args = ap.parse_args(argv)

    t0 = time.time()
    tips = graph.new_claim_tips()
    if args.limit:
        tips = tips[: args.limit]
    if not tips:
        print("no new claim tips")
        return 0

    seen_keys = graph.existing_claim_keys()
    deduper = ClaimDeduper()
    try:
        recent = graph.recent_claims_for_dedup()
        deduper.seed(recent)
    except Exception as e:
        recent = []
        print(f"  (dedup seed skipped: {e})")
    print(f"{len(tips)} new tips · {len(seen_keys)} claim keys, {len(recent)} prior fact-checks")

    written = checked = dupes = 0
    for tip in tips:
        try:
            rec = classify(tip)
        except Exception as e:
            print(f"  ! classify error for tip {tip['item_id']}: {e}")
            continue
        checked += 1
        if rec is None:
            print(f"  ~ inconclusive, left in queue: {tip['claim_text'][:80]!r}")
            continue

        if rec["claim_key"] in seen_keys:
            dupes += 1
            print(f"  = already fact-checked (exact): {rec['headline']}")
            if not args.dry_run:
                graph.mark_tip_status(tip["item_id"], "Duplicate")
            continue

        prior = deduper.match(rec["state"], rec["lga"], rec["claim"])
        if prior:
            dupes += 1
            print(f"  ~ resurfacing claim, already covered: {rec['headline']}")
            print(f"      (matches: {prior[:100]!r})")
            if not args.dry_run:
                graph.mark_tip_status(tip["item_id"], "Duplicate")
            continue

        if args.dry_run:
            print(
                f"  + [{rec['verdict']}] ({rec['confidence']}) {rec['category']} — "
                f"{rec['headline']}"
            )
            print(f"      evidence: {rec['evidence'][:140]!r}")
            if rec["source_url"]:
                print(f"      source: {rec['source_url']}")
        else:
            try:
                graph.create_fact_check(rec)
                graph.mark_tip_status(tip["item_id"], "Triaged")
                written += 1
            except Exception as e:
                print(f"  ! write error for tip {tip['item_id']}: {e}")
                continue
        seen_keys.add(rec["claim_key"])
        deduper.add(rec["state"], rec["lga"], rec["claim"])

    dt = time.time() - t0
    print(
        f"\ndone in {dt:.0f}s — tips {len(tips)}, checked {checked}, "
        f"dupes {dupes}, {'would write' if args.dry_run else 'written'} "
        f"{checked - dupes if args.dry_run else written}"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(2)
