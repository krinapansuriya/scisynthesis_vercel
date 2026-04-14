"""
AUTH DEPENDENCY
===============
Resolves the current authenticated user from the incoming request.

Token lookup order (most secure first):
  1. httpOnly cookie "access_token"  — set by /auth/login and /auth/verify-otp
  2. Authorization: Bearer <token>   — fallback for Swagger UI and API clients

Using auto_error=False on OAuth2PasswordBearer so the scheme doesn't reject
requests that arrive via cookie (which carry no Authorization header).
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core import security
from app.core.database import get_db
from app.models.schemas import TokenData
from app.models.user import User as UserModel

logger = logging.getLogger("scisynthesis.auth")

# auto_error=False → does not raise 401 when no Bearer header is present.
# We handle the "no token anywhere" case ourselves below.
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="api/v1/auth/login",
    auto_error=False,
)

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    """
    Resolve the authenticated user.

    Prefers the httpOnly cookie (set by /login and /verify-otp) over an
    explicit Authorization header, so browser sessions are always cookie-based.
    API clients (Swagger, curl) can still pass a Bearer token.
    """
    # 1. Try httpOnly cookie first (most secure)
    token: Optional[str] = request.cookies.get("access_token")

    # 2. Fall back to Authorization: Bearer header
    if not token:
        token = bearer_token

    if not token:
        logger.warning("Unauthenticated request to %s", request.url.path)
        raise _CREDENTIALS_EXCEPTION

    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        email: Optional[str] = payload.get("sub")
        if email is None:
            raise _CREDENTIALS_EXCEPTION
        token_data = TokenData(email=email)
    except JWTError:
        raise _CREDENTIALS_EXCEPTION

    result = await db.execute(
        select(UserModel).where(UserModel.email == token_data.email)
    )
    user = result.scalars().first()
    if user is None:
        raise _CREDENTIALS_EXCEPTION

    return user
