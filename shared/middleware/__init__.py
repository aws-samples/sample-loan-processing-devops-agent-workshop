"""Shared JWT authentication middleware for all services.

Workshop note:
  - JWT_SECRET MUST be set via environment (or AWS Secrets Manager). There is
    NO fallback — the service refuses to start without a real secret.
  - Tokens carry `iss` (issuer) and `aud` (audience) claims; we validate both.
  - Algorithm is fixed via env (default HS256). To accept multiple algorithms
    per a downstream policy, set JWT_ALGORITHMS as a comma-separated list.
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional


logger = logging.getLogger(__name__)


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is not set. Configure it via environment variable or "
            "AWS Secrets Manager before starting the service."
        )
    return value


def _split_csv(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


# Validate critical env BEFORE pulling in heavy third-party libs so the error
# message is friendly even in minimal environments.
JWT_SECRET = _required_env("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ALGORITHMS = _split_csv(os.getenv("JWT_ALGORITHMS")) or [JWT_ALGORITHM]
JWT_ISSUER = os.getenv("JWT_ISSUER", "loan-management-system")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "loan-management-api")


from fastapi import Depends, HTTPException, status  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer  # noqa: E402
from jose import JWTError, jwt  # noqa: E402
from pydantic import BaseModel  # noqa: E402


security = HTTPBearer()


class TokenPayload(BaseModel):
    sub: str
    username: str
    role: str
    permissions: List[str]


def decode_token(token: str) -> TokenPayload:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=JWT_ALGORITHMS,
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
            options={"require_exp": True, "require_iat": True},
        )
    except JWTError as exc:
        logger.info("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    try:
        return TokenPayload(
            sub=payload["sub"],
            username=payload["username"],
            role=payload["role"],
            permissions=payload.get("permissions", []),
        )
    except KeyError as exc:
        logger.info("JWT missing required claim: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required claims",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> TokenPayload:
    """FastAPI dependency to get the current authenticated user from a JWT."""
    return decode_token(credentials.credentials)


def require_role(*roles: str):
    """FastAPI dependency factory to require one of the given roles."""

    def role_checker(current_user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
        if "admin:all" in current_user.permissions:
            return current_user
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' not authorized. Required: {roles}",
            )
        return current_user

    return role_checker


def require_permission(*permissions: str):
    """FastAPI dependency factory to require all of the given permissions."""

    def permission_checker(current_user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
        if "admin:all" in current_user.permissions:
            return current_user
        for perm in permissions:
            if perm not in current_user.permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission '{perm}' required",
                )
        return current_user

    return permission_checker
