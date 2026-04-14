"""
RATE LIMITER
============
Singleton slowapi Limiter used across all API routers.
Import this module — do NOT instantiate Limiter elsewhere.

Usage in a route:
    from app.core.limiter import limiter
    from fastapi import Request

    @router.post("/login")
    @limiter.limit("10/minute")
    async def login(request: Request, ...):
        ...
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Key function: rate-limit by client IP address.
# For production behind a reverse proxy, replace with a function that reads
# the X-Forwarded-For header (after validating the proxy is trusted).
limiter = Limiter(key_func=get_remote_address, default_limits=[])
