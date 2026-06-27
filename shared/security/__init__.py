"""Shared FastAPI helpers (CORS, security defaults).

Workshop note:
  - CORS origins come from the CORS_ALLOWED_ORIGINS env var (comma-separated).
  - In Workshop Studio set this to the CloudFront distribution URL.
  - For local development the docker-compose default is
    http://localhost:8000,http://localhost:5173.
"""

from __future__ import annotations

import os
from typing import Iterable, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware


_DEFAULT_LOCAL_ORIGINS = (
    "http://localhost:8000",
    "http://localhost:3000",
    "http://localhost:5173",
)


def _split_csv(value: str | None) -> List[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


def get_allowed_origins() -> List[str]:
    """Resolve allowed CORS origins from environment.

    Falls back to localhost dev origins ONLY if APP_ENV is "local" or unset.
    In any other environment the variable MUST be set explicitly.
    """
    env = os.getenv("APP_ENV", "local").lower()
    configured = _split_csv(os.getenv("CORS_ALLOWED_ORIGINS"))
    if configured:
        return configured
    if env in {"local", "dev", "development"}:
        return list(_DEFAULT_LOCAL_ORIGINS)
    raise RuntimeError(
        "CORS_ALLOWED_ORIGINS must be set explicitly when APP_ENV is "
        f"'{env}'. Refusing to start with permissive defaults."
    )


def get_trusted_hosts() -> List[str]:
    """Resolve trusted Host header values from environment."""
    configured = _split_csv(os.getenv("TRUSTED_HOSTS"))
    if configured:
        return configured
    # Starlette only allows wildcards at the start of a pattern (`*.example.com`),
    # so we list common ALB / load-balancer DNS suffixes plus the local-dev hosts.
    # In Workshop Studio set TRUSTED_HOSTS to the deployed CloudFront domain plus
    # the ALB DNS to lock this down further.
    return [
        "localhost",
        "127.0.0.1",
        "*.local",
        "*.elb.amazonaws.com",
        "*.cloudfront.net",
        "*.amazonaws.com",
    ]


def install_security_middleware(
    app: FastAPI,
    *,
    allowed_methods: Iterable[str] | None = None,
    allowed_headers: Iterable[str] | None = None,
) -> None:
    """Install CORS + TrustedHost middleware with safe defaults."""
    methods = list(allowed_methods or ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    headers = list(allowed_headers or ["Authorization", "Content-Type", "X-Request-Id"])

    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_allowed_origins(),
        allow_credentials=True,
        allow_methods=methods,
        allow_headers=headers,
        max_age=600,
    )

    if os.getenv("ENABLE_TRUSTED_HOST", "false").lower() == "true":
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=get_trusted_hosts())
