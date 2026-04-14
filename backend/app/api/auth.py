"""
AUTH API
========
Security hardening applied:
  - JWT issued as httpOnly cookie (XSS-proof) on /login and /verify-otp
  - /logout endpoint clears the cookie
  - Rate limiting: 10/min on /login, 5/min on /send-otp, 20/min on /register
  - OTP store moved to Redis (db=2) with in-memory fallback
  - Avatar file extension derived from MIME type, not user filename
  - Structured logging for all auth events
"""

import json
import logging
import os
import uuid
import secrets
import hmac
from datetime import timedelta, datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.core import security
from app.core.database import get_db
from app.core.limiter import limiter
from app.models.user import User as UserModel
from app.models.paper import Paper as PaperModel
from app.models.project import Project as ProjectModel, Note as NoteModel
from app.models.schemas import UserCreate, Token, User as UserSchema, UserUpdate, UserStats
from app.api.deps import get_current_user

logger = logging.getLogger("scisynthesis.auth")

# ── OTP store — Redis-backed with in-memory fallback ─────────────────────────
_otp_mem: Dict[str, dict] = {}
_otp_redis = None

try:
    import redis as _redis_lib
    _otp_redis = _redis_lib.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        db=2,
        decode_responses=True,
    )
    _otp_redis.ping()
    logger.info("OTP store: Redis enabled (db=2).")
except Exception:
    _otp_redis = None
    logger.warning("OTP store: Redis unavailable — using in-memory fallback.")

OTP_TTL = 300  # 5 minutes


def _otp_set(phone: str, data: dict) -> None:
    if _otp_redis:
        try:
            _otp_redis.setex(f"otp:{phone}", OTP_TTL, json.dumps(data, default=str))
            return
        except Exception as e:
            logger.error("OTP Redis write failed: %s", e)
    _otp_mem[phone] = data


def _otp_get(phone: str) -> Optional[dict]:
    if _otp_redis:
        try:
            raw = _otp_redis.get(f"otp:{phone}")
            return json.loads(raw) if raw else None
        except Exception as e:
            logger.error("OTP Redis read failed: %s", e)
    return _otp_mem.get(phone)


def _otp_del(phone: str) -> None:
    if _otp_redis:
        try:
            _otp_redis.delete(f"otp:{phone}")
        except Exception as e:
            logger.error("OTP Redis delete failed: %s", e)
    _otp_mem.pop(phone, None)


# ── Cookie helpers ────────────────────────────────────────────────────────────
COOKIE_NAME = "access_token"
COOKIE_MAX_AGE = security.ACCESS_TOKEN_EXPIRE_MINUTES * 60  # seconds

# Set secure=True in production (HTTPS). In development over HTTP use False.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,          # Not accessible from JavaScript — XSS-proof
        max_age=COOKIE_MAX_AGE,
        samesite="lax",         # Sent on same-site navigations; works on localhost
        secure=COOKIE_SECURE,   # True in production (HTTPS only)
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/", samesite="lax")


# ── Avatar config ─────────────────────────────────────────────────────────────
AVATARS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "avatars")
ALLOWED_MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/gif":  "gif",
}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 MB

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Profile endpoints ─────────────────────────────────────────────────────────

@router.get("/me", response_model=UserSchema)
async def get_me(current_user: UserModel = Depends(get_current_user)):
    return current_user


@router.get("/stats", response_model=UserStats)
async def get_stats(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    papers   = await db.execute(select(func.count()).where(PaperModel.user_id == current_user.id))
    projects = await db.execute(select(func.count()).where(ProjectModel.user_id == current_user.id))
    notes    = await db.execute(select(func.count()).where(NoteModel.user_id == current_user.id))
    return UserStats(
        papers_analyzed=papers.scalar() or 0,
        projects_created=projects.scalar() or 0,
        notes_written=notes.scalar() or 0,
    )


@router.put("/me", response_model=UserSchema)
async def update_me(
    user_in: UserUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    update_data = user_in.model_dump(exclude_unset=True)

    if "password" in update_data:
        current_user.hashed_password = security.get_password_hash(update_data.pop("password"))

    if "email" in update_data and update_data["email"] != current_user.email:
        existing = await db.execute(
            select(UserModel).where(UserModel.email == update_data["email"])
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Email already registered to another account.")

    for field, value in update_data.items():
        setattr(current_user, field, value)

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/avatar", response_model=UserSchema)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate MIME type against allowlist
    if file.content_type not in ALLOWED_MIME_TO_EXT:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or GIF images are allowed.")

    contents = await file.read()
    if len(contents) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="File size must be under 5 MB.")

    # Delete old avatar
    if current_user.profile_picture:
        old_path = os.path.join(AVATARS_DIR, current_user.profile_picture)
        if os.path.exists(old_path):
            os.remove(old_path)

    # Derive extension from MIME type — not from user-supplied filename (safer)
    ext = ALLOWED_MIME_TO_EXT[file.content_type]
    filename = f"{current_user.id}_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(AVATARS_DIR, filename)
    os.makedirs(AVATARS_DIR, exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(contents)

    current_user.profile_picture = filename
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    logger.info("Avatar updated for user %d", current_user.id)
    return current_user


@router.delete("/me/avatar", response_model=UserSchema)
async def delete_avatar(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.profile_picture:
        old_path = os.path.join(AVATARS_DIR, current_user.profile_picture)
        if os.path.exists(old_path):
            os.remove(old_path)
        current_user.profile_picture = None
        db.add(current_user)
        await db.commit()
        await db.refresh(current_user)
    return current_user


# ── OTP ───────────────────────────────────────────────────────────────────────

class OTPRequest(BaseModel):
    phone_number: str

class OTPVerify(BaseModel):
    phone_number: str
    otp: str


@router.post("/send-otp")
@limiter.limit("5/minute")          # Prevent SMS bombing
async def send_otp(
    request: Request,               # Required by slowapi
    req: OTPRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserModel).where(UserModel.phone_number == req.phone_number)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="No account found with this phone number. Register first or add it in Profile settings.",
        )

    otp_code = str(secrets.randbelow(900000) + 100000)  # Cryptographically secure 6-digit OTP
    expiry = datetime.now(timezone.utc) + timedelta(seconds=OTP_TTL)
    _otp_set(req.phone_number, {"otp": otp_code, "expiry": expiry.isoformat(), "user_id": user.id})

    logger.info("OTP issued for phone %s (user %d)", req.phone_number[-4:].rjust(len(req.phone_number), "*"), user.id)

    # In production: send via SMS (Twilio / MSG91 / etc.)
    # In development: OTP is printed to the server console for testing.
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
    if ENVIRONMENT != "production":
        print(f"\n{'='*40}\n  DEV MODE OTP for {req.phone_number}: {otp_code}\n{'='*40}\n")
        logger.info("DEV OTP for %s: %s", req.phone_number, otp_code)
        return {
            "message": f"OTP sent to {req.phone_number}",
            "expires_in": "5 minutes",
            "dev_otp": otp_code,   # Removed in production
        }

    return {"message": f"OTP sent to {req.phone_number}", "expires_in": "5 minutes"}


@router.post("/verify-otp", response_model=Token)
@limiter.limit("10/minute")
async def verify_otp(
    request: Request,
    response: Response,
    req: OTPVerify,
    db: AsyncSession = Depends(get_db),
):
    record = _otp_get(req.phone_number)
    if not record:
        raise HTTPException(status_code=400, detail="No OTP found for this number. Please request a new one.")

    expiry = datetime.fromisoformat(record["expiry"])
    if datetime.now(timezone.utc) > expiry:
        _otp_del(req.phone_number)
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if not hmac.compare_digest(req.otp.strip(), record["otp"]):
        logger.warning("Failed OTP attempt for phone %s", req.phone_number[-4:].rjust(len(req.phone_number), "*"))
        raise HTTPException(status_code=400, detail="Invalid OTP. Please check and try again.")

    result = await db.execute(select(UserModel).where(UserModel.id == record["user_id"]))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    _otp_del(req.phone_number)  # One-time use — invalidate immediately
    access_token = security.create_access_token(subject=user.email)
    _set_auth_cookie(response, access_token)
    logger.info("OTP login successful for user %d", user.id)
    return {"access_token": access_token, "token_type": "bearer"}


# ── Registration ──────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserSchema)
@limiter.limit("20/minute")
async def register(
    request: Request,
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserModel).where(UserModel.email == user_in.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    hashed_password = security.get_password_hash(user_in.password)
    user_dict = user_in.model_dump()
    del user_dict["password"]

    new_user = UserModel(**user_dict, hashed_password=hashed_password)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    logger.info("New user registered: %s", user_in.email)
    return new_user


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")         # Brute-force protection
async def login(
    request: Request,               # Required by slowapi
    response: Response,             # Used to set the httpOnly cookie
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserModel).where(UserModel.email == form_data.username)
    )
    user = result.scalars().first()

    if not user or not security.verify_password(form_data.password, user.hashed_password):
        logger.warning("Failed login attempt for email: %s", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = security.create_access_token(subject=user.email)

    # Set httpOnly cookie — cannot be read by JavaScript (XSS-proof)
    _set_auth_cookie(response, access_token)

    logger.info("Login successful for user %d", user.id)
    # Also return the token in the body so Swagger UI and API clients work
    return {"access_token": access_token, "token_type": "bearer"}


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(response: Response):
    """Clear the auth cookie. Client should also discard any stored token."""
    _clear_auth_cookie(response)
    return {"message": "Logged out successfully."}
