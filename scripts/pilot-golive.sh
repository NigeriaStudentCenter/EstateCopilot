#!/usr/bin/env bash
# EstateCopilot pilot go-live — run from the repo root.
#
#   PG_ADMIN_PASSWORD='<strong>' ADMIN_API_KEY='<strong>' bash scripts/pilot-golive.sh
#
# Optional: PG_LOCATION=<region>  (default northeurope; westeurope is
# restricted for Postgres Flexible Server on Visual Studio Enterprise subs).
#
# Idempotent-ish: safe to re-run. Creates Postgres, opens the firewall to this
# machine + to Azure services, deploys the backend code (Azure/Oryx builds it
# on Linux so the Prisma engine matches), runs the initial migration, sets the
# app settings, leaves MOCK_MODE=false, and smoke-tests.
set -euo pipefail

RG=estatecopilot-rg
APP=estatecopilot-api
PGSRV=estatecopilot-db
LOC="${PG_LOCATION:-northeurope}"

: "${PG_ADMIN_PASSWORD:?set PG_ADMIN_PASSWORD to a strong password}"
: "${ADMIN_API_KEY:?set ADMIN_API_KEY to a strong random string}"

echo "==> 1/6  Postgres flexible server ($LOC)"
if az postgres flexible-server show -g "$RG" -n "$PGSRV" >/dev/null 2>&1; then
  echo "    already exists — skipping create"
else
  az postgres flexible-server create -g "$RG" -n "$PGSRV" -l "$LOC" \
    --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
    --admin-user ecadmin --admin-password "$PG_ADMIN_PASSWORD" \
    --public-access 0.0.0.0 --yes -o none
fi
az postgres flexible-server db create -g "$RG" -s "$PGSRV" -d estatecopilot -o none 2>/dev/null || true
PGHOST=$(az postgres flexible-server show -g "$RG" -n "$PGSRV" --query fullyQualifiedDomainName -o tsv)
DBURL="postgresql://ecadmin:${PG_ADMIN_PASSWORD}@${PGHOST}:5432/estatecopilot?sslmode=require"
echo "    host: $PGHOST"

echo "==> 2/6  Open the DB firewall to this machine (for the migration)"
MYIP=$(curl -fsS https://api.ipify.org 2>/dev/null || curl -fsS https://ifconfig.me 2>/dev/null)
if [ -n "${MYIP:-}" ]; then
  az postgres flexible-server firewall-rule create -g "$RG" -n "$PGSRV" \
    --rule-name "migrate-client" --start-ip-address "$MYIP" --end-ip-address "$MYIP" -o none
  echo "    allowed $MYIP"
else
  echo "    !! could not detect this machine's public IP — if the migration"
  echo "       step fails, add a firewall rule for your IP in the portal."
fi

echo "==> 3/6  Package + deploy the backend to $APP (Oryx build on Linux)"
PKG=$(mktemp -d)
rsync -a --exclude node_modules --exclude dist --exclude '.env' --exclude 'tsconfig.tsbuildinfo' \
  backend/src backend/package.json backend/package-lock.json backend/tsconfig.json backend/prisma "$PKG/"
( cd "$PKG" && zip -qr "$PKG/app.zip" . -x 'app.zip' )
az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true
az webapp config set -g "$RG" -n "$APP" -o none --startup-file "npm run start"
az webapp deploy -g "$RG" -n "$APP" --src-path "$PKG/app.zip" --type zip
rm -rf "$PKG"

echo "==> 4/6  Apply the initial migration"
( cd backend && DATABASE_URL="$DBURL" npm run prisma:deploy )

echo "==> 5/6  Point the app at the database and leave mock mode"
az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  DATABASE_URL="$DBURL" \
  MOCK_MODE=false \
  ADMIN_API_KEY="$ADMIN_API_KEY" \
  PAYSTACK_HOSTED_PAGE_URL="https://paystack.shop/pay/estatecopilot" \
  LANDLORD_SUBSCRIPTION_AMOUNT_KOBO=1000000
az webapp restart -g "$RG" -n "$APP" -o none

echo "==> 6/6  Smoke test (waiting 30s for the app to come up)"
sleep 30
echo -n "    /health         -> "; curl -fsS "https://${APP}.azurewebsites.net/health" && echo
echo -n "    whatsapp verify -> "; curl -fsS "https://${APP}.azurewebsites.net/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=change-me-verify-token&hub.challenge=OK" && echo
echo -n "    admin/pending   -> "; curl -fsS -H "x-admin-key: ${ADMIN_API_KEY}" "https://${APP}.azurewebsites.net/api/landlord-auth/admin/pending" && echo

echo
echo "Backend is live on Postgres. Before real WhatsApp/Paystack traffic, bump"
echo "the plan off Free (no Always-On):"
echo "  az appservice plan update -g $RG -n estatecopilot-plan --sku B1"
echo "  az webapp config set -g $RG -n $APP --always-on true"
echo "Then push main to ship the frontends."
