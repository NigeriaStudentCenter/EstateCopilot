"""Configuration for the local-government news ingestion agent.

All secrets come from environment variables (see .env.example). Nothing is
hard-coded except the SharePoint object IDs, which are stable.
"""
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    # override=True: a local .env is authoritative over stale shell exports.
    # In Azure there is no .env file, so App Settings (env vars) are used as-is.
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)
except Exception:  # dotenv is optional in Azure Functions (App Settings used instead)
    pass


# --- Microsoft Graph (app-only) ------------------------------------------
TENANT_ID = os.environ["GRAPH_TENANT_ID"]
CLIENT_ID = os.environ["GRAPH_CLIENT_ID"]
CLIENT_SECRET = os.environ["GRAPH_CLIENT_SECRET"]

# Return to Nigeria Initiative site + lists (stable)
SITE_PATH = "bsoed.sharepoint.com:/sites/ReturntoNigeriaInitiative"
LIST_NEWS = "3b546f10-aff5-4014-8a5a-81411efd974b"
LIST_SOURCES = "588e60d7-85a9-4196-8411-c1e8a5ab2534"
LIST_FACTCHECKS = "031a8b07-c991-43d5-90f4-58fe65bc9924"
LIST_CLAIMTIPS = "a2961081-be2a-4192-aa7b-ae4bfddcb093"

# --- Anthropic ---------------------------------------------------------
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
# claude-haiku-4-5 is the cost-effective default for a high-volume classifier.
# Swap to claude-opus-5 for tougher LGA disambiguation if budget allows.
MODEL = os.environ.get("NEWS_AGENT_MODEL", "claude-haiku-4-5")

# --- Run tuning ------------------------------------------------------
MAX_ITEMS_PER_SOURCE = int(os.environ.get("MAX_ITEMS_PER_SOURCE", "12"))
MAX_ARTICLE_AGE_DAYS = int(os.environ.get("MAX_ARTICLE_AGE_DAYS", "4"))
MIN_RELEVANCE = int(os.environ.get("MIN_RELEVANCE", "60"))  # 0-100 from the model
HTTP_TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", "20"))

# When a publisher blocks the scraper (Cloudflare 403, dead TLS), fall back to
# the r.jina.ai reader proxy, which fetches the (public) article server-side and
# returns clean text. Set READER_FALLBACK=0 to disable and stay direct-only.
READER_FALLBACK = os.environ.get("READER_FALLBACK", "1") != "0"
USER_AGENT = os.environ.get(
    "NEWS_AGENT_UA",
    "RNI-NewsAgent/1.0 (+https://bsoed.sharepoint.com/sites/ReturntoNigeriaInitiative)",
)

# News list Choice values — the model must map into these exactly.
CATEGORIES = [
    "Governance & LG Council",
    "Security",
    "Infrastructure & Projects",
    "Health",
    "Education",
    "Economy & Markets",
    "Community & Culture",
    "Environment",
    "Sports",
    "Other",
]

# --- Fact-check agent -----------------------------------------------
FACT_MODEL = os.environ.get("FACT_AGENT_MODEL", "claude-sonnet-4-6")
MIN_CONFIDENCE = int(os.environ.get("FACT_MIN_CONFIDENCE", "50"))
FACT_WEB_SEARCH_MAX_USES = int(os.environ.get("FACT_WEB_SEARCH_MAX_USES", "5"))

# Fact Checks list Choice values — the model must map into these exactly.
VERDICTS = ["True", "False", "Misleading", "Unverifiable", "Satire", "Needs Context"]
FACT_CATEGORIES = [
    "Politics & Elections",
    "Governance & LG Council",
    "Security",
    "Health",
    "Economy & Markets",
    "Social Media / Viral",
    "Education",
    "Infrastructure & Projects",
    "Community & Culture",
    "Other",
]

# Election race levels — tracked pre-election too (candidate claims,
# eligibility/credential disputes, promises, INEC/process rumours), not
# just after results are announced. "N/A" for anything non-electoral.
RACE_LEVELS = [
    "N/A",
    "Presidential / General Election",
    "Senate",
    "House of Representatives",
    "Governorship",
    "Local Government",
]
