# student-agents-api

A thin proxy between the public Student Tools page (`naija-digest/students`) and
the Anthropic API. It exists so the API key lives on the server, not in a
world-readable static page, and so usage can be rate-limited and pinned to a
known set of models.

## What it does

- Holds the **one secret** (`ANTHROPIC_API_KEY`) as a server-side app setting.
- Accepts a small, provider-neutral request and forwards it to the model:
  `POST /run` `{ "tier": "smart" | "fast", "messages": [...], "web": true }`
  → `{ "text": "..." }`
- Routes by tier: `smart` → Sonnet 4.6 (the Study Companion), `fast` → Haiku 4.5
  (the four finders). Both configurable via app settings.
- Injects the web-search tool server-side (`max_uses` capped) and resumes
  `pause_turn` turns so long searches complete.
- Per-IP rate limit (default 8 runs/rolling hour) → `429` when exceeded.
- CORS restricted to the configured origins.
- `messages` passes through as the Anthropic message shape, so the Study
  Companion's uploaded brief (a PDF/image content block) works with no
  server-side file handling.

`GET /health` → `{ status, provider, keyConfigured }` for a quick check that the
key made it into the environment.

## Local dev

```bash
cp .env.example .env      # then paste a real key into .env (never commit it)
npm install
npm run dev               # http://localhost:4002
```

```bash
curl -s localhost:4002/health
curl -s -X POST localhost:4002/run -H 'Content-Type: application/json' \
  -d '{"tier":"fast","web":true,"messages":[{"role":"user","content":"3 student job boards in Leeds"}]}'
```

## Deploy to Azure App Service

Same subscription as `naija-digest-chat-api`. Node 20, Linux, Basic tier is
plenty. Nothing here is committed that contains a secret — the key is set as an
app setting after the code is up.

```bash
# 1. Build
npm ci && npm run build

# 2. Create the App Service (reuses the existing resource group; pick the
#    same region as the chat API). Adjust names if you prefer.
az webapp up \
  --name student-agents-api \
  --resource-group <same-rg-as-naija-digest-chat-api> \
  --runtime "NODE:20-lts" \
  --sku B1 \
  --location <same-region>

# 3. Tell App Service how to start it
az webapp config set \
  --name student-agents-api --resource-group <rg> \
  --startup-file "node dist/index.js"

# 4. Non-secret settings
az webapp config appsettings set \
  --name student-agents-api --resource-group <rg> \
  --settings \
    CORS_ORIGIN="https://news.nigeriastudentambassador.com" \
    RATE_LIMIT_PER_HOUR=8 \
    MODEL_SMART=claude-sonnet-4-6 \
    MODEL_FAST=claude-haiku-4-5 \
    PROVIDER=anthropic \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false

# 5. The secret — run this yourself, do not put the key in any file:
az webapp config appsettings set \
  --name student-agents-api --resource-group <rg> \
  --settings ANTHROPIC_API_KEY="sk-ant-..."
```

Then confirm:

```bash
curl -s https://student-agents-api.azurewebsites.net/health
# expect: {"status":"ok","provider":"anthropic","keyConfigured":true}
```

### Better: Key Vault reference for the key (optional)

Instead of step 5, store the key in the same Key Vault the other services use
and set:

```bash
az webapp config appsettings set --name student-agents-api --resource-group <rg> \
  --settings ANTHROPIC_API_KEY="@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/anthropic-api-key/)"
```

(needs a system-assigned identity on the web app with `get` on that vault's secrets).

## Cost controls

- Set a **monthly spend limit** in the Anthropic Console — the real backstop.
- `RATE_LIMIT_PER_HOUR` bounds a single abuser.
- `MAX_TOKENS_SMART` / `MAX_TOKENS_FAST` and `WEB_SEARCH_MAX_USES` bound a
  single run.

## Scaling note

The rate limiter is in-memory, so the limit is per instance. Fine on a single
instance (the default). If this is ever scaled out, move the limiter to Redis /
Azure Cache so the cap is shared.
