"""
CHAT MEMORY MODULE  (UPGRADED — Redis-persistent)
==================================================
Per-user conversation history for context-aware RAG chat.

Persistence strategy (automatic fallback):
  1. Redis (db=1, key prefix "chat_memory:user:<id>")
     — survives server restarts, TTL = 24 h, shared across workers
  2. In-memory dict (original behaviour)
     — used when Redis is unavailable; memory lost on server restart

All existing callers (analysis.py /chat) work unchanged — the public API
is fully backward-compatible.

Changes vs original:
  - MAX_HISTORY raised from 10 → 20 turns (more context for follow-ups)
  - Redis persistence layer added (transparent to callers)
  - get_history() no longer loses data across restarts when Redis is up
"""

import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List

# ── Configuration ─────────────────────────────────────────────────────────────
MAX_HISTORY = 20        # Maximum (user + assistant) turns kept per user
REDIS_TTL   = 86400     # 24-hour TTL on Redis keys (seconds)
REDIS_DB    = 1         # Use db=1 to stay separate from the embedding cache (db=0)

# ── Redis setup (optional) ────────────────────────────────────────────────────
_redis = None
try:
    import redis as _redis_lib
    _host = os.getenv("REDIS_HOST", "localhost")
    _port = int(os.getenv("REDIS_PORT", "6379"))
    _redis = _redis_lib.Redis(host=_host, port=_port, db=REDIS_DB, decode_responses=True)
    _redis.ping()
    print("[ChatMemory] Redis persistence enabled (db=1, TTL=24h).")
except Exception:
    _redis = None
    print("[ChatMemory] Redis unavailable — using in-memory fallback.")

# ── In-memory fallback store ──────────────────────────────────────────────────
# { user_id: [ { "role": "user"|"assistant", "content": str, "ts": ISO-str } ] }
_store: Dict[int, List[Dict]] = defaultdict(list)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _redis_key(user_id: int) -> str:
    return f"chat_memory:user:{user_id}"


def _write_redis(user_id: int, history: List[Dict]) -> bool:
    """Persist history to Redis. Returns True on success."""
    if not _redis:
        return False
    try:
        _redis.setex(_redis_key(user_id), REDIS_TTL, json.dumps(history))
        return True
    except Exception as e:
        print(f"[ChatMemory] Redis write failed: {e}")
        return False


def _read_redis(user_id: int) -> List[Dict]:
    """Read history from Redis. Returns empty list on miss or error."""
    if not _redis:
        return []
    try:
        raw = _redis.get(_redis_key(user_id))
        return json.loads(raw) if raw else []
    except Exception as e:
        print(f"[ChatMemory] Redis read failed: {e}")
        return []


# ── Public API (fully backward-compatible) ────────────────────────────────────

def add_turn(user_id: int, role: str, content: str) -> None:
    """
    Append one conversational turn to the user's history.

    Args:
        user_id:  Authenticated user's DB id.
        role:     "user" or "assistant".
        content:  The message text.
    """
    turn = {
        "role":    role,
        "content": content,
        "ts":      datetime.now(timezone.utc).isoformat(),
    }

    if _redis:
        # Redis path — read → append → trim → write (atomic enough for chat)
        history = _read_redis(user_id)
        history.append(turn)
        if len(history) > MAX_HISTORY:
            history = history[-MAX_HISTORY:]
        if _write_redis(user_id, history):
            return
        # Fall through to in-memory if Redis write failed

    # In-memory path
    _store[user_id].append(turn)
    if len(_store[user_id]) > MAX_HISTORY:
        _store[user_id] = _store[user_id][-MAX_HISTORY:]


def get_history(user_id: int) -> List[Dict]:
    """Return a copy of the user's full conversation history."""
    if _redis:
        history = _read_redis(user_id)
        if history:
            return history
    return list(_store[user_id])


def clear_history(user_id: int) -> None:
    """Wipe the user's conversation history (e.g. on explicit reset)."""
    if _redis:
        try:
            _redis.delete(_redis_key(user_id))
        except Exception as e:
            print(f"[ChatMemory] Redis delete failed: {e}")
    _store[user_id] = []


def build_context_block(user_id: int) -> str:
    """
    Format prior turns into a plain-text block for Gemini prompts.

    Returns an empty string when no history exists, so callers can
    include it unconditionally.

    Example output:
        === CONVERSATION HISTORY ===
        User: What methods are used in the study?
        Assistant: The study uses a mixed-methods approach ...
        User: Explain more about the quantitative part.
        === END OF HISTORY ===
    """
    history = get_history(user_id)
    if not history:
        return ""

    lines = ["=== CONVERSATION HISTORY ==="]
    for turn in history:
        label = "User" if turn["role"] == "user" else "Assistant"
        lines.append(f"{label}: {turn['content']}")
    lines.append("=== END OF HISTORY ===")
    return "\n".join(lines)
