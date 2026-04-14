from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# ── Database URL ──────────────────────────────────────────────────────────────
# Priority order:
#   1. APP_DATABASE_URL env var (set in Vercel dashboard or .env)
#   2. Vercel / read-only filesystem fallback → /tmp/ (ephemeral, resets per instance)
#   3. Local dev fallback → ./research_assistant.db
#
# For a persistent production database, set APP_DATABASE_URL to a PostgreSQL
# async connection string, e.g.:
#   postgresql+asyncpg://user:pass@host/dbname
# and add `asyncpg` to requirements.txt.

def _default_database_url() -> str:
    """Return a safe default DB URL depending on the runtime environment."""
    # Vercel / Lambda: filesystem is read-only except for /tmp/
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        return "sqlite+aiosqlite:////tmp/research_assistant.db"
    return "sqlite+aiosqlite:///./research_assistant.db"

DATABASE_URL = os.getenv("APP_DATABASE_URL", _default_database_url())

engine = create_async_engine(
    DATABASE_URL,
    # check_same_thread is only relevant for SQLite; asyncpg ignores it
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    # Import models here to ensure they are registered with Base.metadata
    from app.models.user import User
    from app.models.paper import Paper
    from app.models.chunk import DocumentChunk
    from app.models.project import Project, Note
    from app.models.search_history import SearchHistory

    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migrate: add new columns to existing tables without breaking if already present
        for sql in [
            "ALTER TABLE users ADD COLUMN created_at DATETIME",
            "ALTER TABLE users ADD COLUMN profile_picture VARCHAR",
        ]:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass  # Column already exists
        # Backfill created_at for existing users
        await conn.execute(text(
            "UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
        ))
