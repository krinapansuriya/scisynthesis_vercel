"""
Vercel entry point for the SciSynthesis FastAPI backend.

How it works:
  Vercel routes /api/* and /avatars/* to this file (see vercel.json).
  Mangum wraps the ASGI FastAPI app so it can run as a serverless function.

Notes on Vercel's serverless environment:
  - The filesystem is read-only except for /tmp/.
  - Each cold start re-runs startup (creates DB tables, etc.) — that's fine.
  - Redis is not available unless you set REDIS_HOST / REDIS_PORT env vars
    pointing to an external Redis instance (e.g. Upstash). Without it the app
    falls back to an in-memory OTP store automatically.
  - SQLite data is stored in /tmp/ and is ephemeral per instance. For a
    persistent database in production, set APP_DATABASE_URL to a PostgreSQL
    connection string (e.g. from Supabase or Neon) and add asyncpg to deps.
"""

import sys
import os

# Make `backend/` importable from the project root
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

# Import the FastAPI application
from backend.app.main import app  # noqa: E402
from mangum import Mangum           # noqa: E402

# `lifespan="auto"` lets Mangum honour FastAPI startup/shutdown events,
# which runs init_db() on every cold start.
handler = Mangum(app, lifespan="auto")
