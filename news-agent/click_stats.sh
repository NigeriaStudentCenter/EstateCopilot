#!/bin/sh
# NSA TV link experiment: views of NSA TV and taps on each tracked link
# (agent/clicks.py), per day for the last N days (default 7). Usage: ./click_stats.sh [days]
CONN=$(az functionapp config appsettings list -g rg-rni-newsagent -n func-rni-newsagent \
  --query "[?name=='AzureWebJobsStorage'].value" -o tsv)
TMP=$(mktemp -d)
for k in $(seq 0 $(( ${1:-7} - 1 ))); do
  d=$(date -u -v-${k}d +%F)
  az storage blob download --connection-string "$CONN" -c shared-cache -n "clicks/$d.log" \
    -f "$TMP/$d.log" -o none --no-progress 2>/dev/null || continue
  echo "== $d"
  grep -v "	test$" "$TMP/$d.log" | cut -f2,3 | sort | uniq -c | sort -rn
done
rm -rf "$TMP"
