"""Tiny on-disk cache of classification results, keyed by article_key.

A full run classifies ~450 articles (~10 min of API calls). If a run is
re-tried (write failure, crash, tuning) this lets it skip re-classifying
anything it has already seen. Entries expire after CACHE_TTL_DAYS.

Disabled with --no-cache or NEWS_AGENT_CACHE=0.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

_PATH = Path(__file__).resolve().parent.parent / ".cache" / "classifications.json"
_TTL = int(os.environ.get("CACHE_TTL_DAYS", "14")) * 86400
_ENABLED = os.environ.get("NEWS_AGENT_CACHE", "1") != "0"


class Cache:
    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled and _ENABLED
        self._data: dict[str, dict[str, Any]] = {}
        self._dirty = False
        if self.enabled and _PATH.exists():
            try:
                raw = json.loads(_PATH.read_text())
                now = time.time()
                self._data = {k: v for k, v in raw.items() if now - v.get("ts", 0) < _TTL}
            except Exception:
                self._data = {}

    def get(self, key: str):
        """Returns (hit: bool, record: dict | None). record None == 'classified, rejected'."""
        if not self.enabled or key not in self._data:
            return False, None
        return True, self._data[key].get("rec")

    def put(self, key: str, rec: dict[str, Any] | None) -> None:
        if not self.enabled:
            return
        self._data[key] = {"ts": time.time(), "rec": rec}
        self._dirty = True

    def flush(self) -> None:
        if not self.enabled or not self._dirty:
            return
        _PATH.parent.mkdir(parents=True, exist_ok=True)
        _PATH.write_text(json.dumps(self._data))
        self._dirty = False

    def __len__(self) -> int:
        return len(self._data)
