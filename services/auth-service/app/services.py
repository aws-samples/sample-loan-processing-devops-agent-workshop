"""Business logic for Auth Service."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import settings
from .models import RefreshToken, Role, User
from .schemas import UserCreate


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user: User) -> str:
    """Create a JWT access token with iss/aud/iat/exp claims."""
    now = datetime.utcnow()
    expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role.name,
        "permissions": user.role.permissions,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": expire,
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(db: Session, user: User) -> str:
    """Create and store a refresh token."""
    token_value = secrets.token_urlsafe(48)
    expires_at = datetime.utcnow() + timedelta(days=settings.jwt_refresh_token_expire_days)

    refresh_token = RefreshToken(
        user_id=user.id,
        token=token_value,
        expires_at=expires_at,
    )
    db.add(refresh_token)
    db.commit()
    return token_value


def register_user(db: Session, data: UserCreate) -> User:
    """Register a new user."""
    existing = db.query(User).filter(User.username == data.username.lower()).first()
    if existing:
        raise ValueError("Username already taken")

    existing_email = db.query(User).filter(User.email == data.email.lower()).first()
    if existing_email:
        raise ValueError("Email already registered")

    role = db.query(Role).filter(Role.name == data.role_name).first()
    if not role:
        raise ValueError(f"Role '{data.role_name}' not found")

    user = User(
        username=data.username.lower(),
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        role_id=role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Authenticate a user by username and password."""
    user = db.query(User).filter(User.username == username.lower()).first()
    if not user or not user.is_active:  # nosemgrep: is-function-without-parentheses
        return None
    if not verify_password(password, user.password_hash):
        return None

    user.last_login = datetime.utcnow()
    db.commit()
    return user


def refresh_user_token(db: Session, token_value: str) -> Optional[User]:
    """Validate refresh token and return associated user (with rotation)."""
    token = db.query(RefreshToken).filter(
        RefreshToken.token == token_value,
        RefreshToken.is_revoked == False,  # noqa: E712  # nosemgrep: is-function-without-parentheses
        RefreshToken.expires_at > datetime.utcnow(),
    ).first()

    if not token:
        return None

    token.is_revoked = True  # nosemgrep: is-function-without-parentheses
    db.commit()

    user = db.query(User).filter(User.id == token.user_id, User.is_active == True).first()  # noqa: E712  # nosemgrep: is-function-without-parentheses
    return user


def get_user_by_id(db: Session, user_id: uuid.UUID) -> Optional[User]:
    """Get user by ID."""
    return db.query(User).filter(User.id == user_id).first()


def get_all_users(db: Session, skip: int = 0, limit: int = 50):
    """Get all users with pagination."""
    return db.query(User).offset(skip).limit(limit).all()


def update_user_role(db: Session, user_id: uuid.UUID, role_name: str) -> Optional[User]:
    """Update a user's role."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        raise ValueError(f"Role '{role_name}' not found")

    user.role_id = role.id
    db.commit()
    db.refresh(user)
    return user


def deactivate_user(db: Session, user_id: uuid.UUID) -> Optional[User]:
    """Deactivate a user and revoke all tokens."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    user.is_active = False  # nosemgrep: is-function-without-parentheses

    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.is_revoked == False,  # noqa: E712  # nosemgrep: is-function-without-parentheses
    ).update({"is_revoked": True})

    db.commit()
    db.refresh(user)
    return user
