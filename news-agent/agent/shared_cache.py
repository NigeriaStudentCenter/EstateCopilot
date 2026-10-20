"""A cache shared by every running copy of the function app.

Azure Flex Consumption spreads requests over several instances, so an
in-memory cache rarely helps: most requests land on an instance that has to
rebuild the national headlines (~4 s of RSS fetches) and the YouTube live
checks (~1 s). Values are kept as small JSON blobs in the app's own storage
account (AzureWebJobsStorage), with a short in-memory layer on top, and the
`warm_caches` timer refreshes them every minute so requests never wait.

Without a storage connection (local runs) it behaves like a plain memory cache.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Callable

_CONTAINER = "shared-cache"
_MEMORY_S = 20
_memory: dict[str, tuple[float, Any]] = {}
_container_client = None


def _container():
    global _container_client
    if _container_client is not None:
        return _container_client or None
    conn = os.environ.get("AzureWebJobsStorage", "")
    if "AccountKey=" not in conn and "SharedAccessSignature=" not in conn:
        _container_client = False
        return None
    try:
        from azure.storage.blob import BlobServiceClient

        client = BlobServiceClient.from_connection_string(conn).get_container_client(_CONTAINER)
        try:
            client.create_container()
        except Exception:
            pass  # already exists
        _container_client = client
    except Exception:
        logging.exception("shared_cache: storage unavailable, using memory only")
        _container_client = False
    return _container_client or None


def _read(key: str) -> tuple[float, Any] | None:
    c = _container()
    if not c:
        return None
    try:
        raw = c.download_blob(f"{key}.json", timeout=5).readall()
        doc = json.loads(raw)
        return float(doc["ts"]), doc["value"]
    except Exception:
        return None


def _write(key: str, value: Any) -> None:
    c = _container()
    if not c:
        return
    try:
        c.upload_blob(f"{key}.json", json.dumps({"ts": time.time(), "value": value}), overwrite=True, timeout=5)
    except Exception:
        logging.warning("shared_cache: write %s failed", key, exc_info=True)


def cached(key: str, ttl: float, load: Callable[[], Any], *, force: bool = False) -> Any:
    """`load()`'s value, at most `ttl` seconds old. If the stored copy is too old
    but loading fails, the old copy is returned rather than an error."""
    now = time.time()
    if not force:
        hit = _memory.get(key)
        if hit and now - hit[0] < min(ttl, _MEMORY_S):
            return hit[1]
    stored = None if force else _read(key)
    if stored and now - stored[0] < ttl:
        _memory[key] = (now, stored[1])
        return stored[1]
    try:
        value = load()
    except Exception:
        if stored:
            logging.warning("shared_cache: refresh of %s failed, serving the stored copy", key, exc_info=True)
            return stored[1]
        raise
    _memory[key] = (now, value)
    _write(key, value)
    return value
