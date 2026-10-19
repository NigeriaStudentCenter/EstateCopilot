"""Apply triage decisions to the News list, one PATCH at a time.

Usage: apply_review.py decisions.json [--go]
Without --go it's a dry run (prints what it would do).
decisions.json: {"publish": [ids...], "reject": [ids...]}
"""
import json
import sys
import time

sys.path.insert(0, "/Users/johnaikeremiokha/Desktop/Claude Project/news-agent")

from agent import config
from agent.graph import _client, site_id

def main() -> None:
    path = sys.argv[1]
    go = "--go" in sys.argv[2:]
    with open(path) as f:
        d = json.load(f)

    plan = [(i, "Published") for i in d.get("publish", [])] + \
           [(i, "Rejected") for i in d.get("reject", [])]
    print(f"{len(plan)} items to update ({len(d.get('publish', []))} publish, "
          f"{len(d.get('reject', []))} reject). go={go}\n")

    ok = fail = 0
    with _client() as c:
        base = f"/sites/{site_id()}/lists/{config.LIST_NEWS}/items"
        for item_id, status in plan:
            if not go:
                print(f"  DRY  {item_id} -> {status}")
                continue
            r = c.patch(f"{base}/{item_id}/fields", json={"Status": status})
            if r.status_code < 300:
                ok += 1
                print(f"  OK   {item_id} -> {status}")
            else:
                fail += 1
                print(f"  FAIL {item_id} -> {status}: {r.status_code} {r.text[:200]}")
            time.sleep(0.4)

    if go:
        print(f"\ndone: {ok} ok, {fail} failed")

if __name__ == "__main__":
    main()
