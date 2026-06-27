"""Configuration settings for Auth Service.

Workshop-safe defaults:
  - JWT_SECRET MUST be set (no fallback). Stored in AWS Secrets Manager
    in CDK, or in the gitignored .env file locally.
  - DB password is read from env or Secrets Manager via DB_PASSWORD.
  - ENABLE_DEMO_SEED defaults to false; set true only for the workshop.
"""

from __future__ import annotations

from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # JWT (no defaults — must come from env / Secrets Manager)
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "loan-management-system"
    jwt_audience: str = "loan-management-api"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # Auth tuning
    bcrypt_rounds: int = 12
    enable_demo_seed: bool = False
    login_rate_limit: str = "10/minute"

    # Database
    database_url: str = ""
    db_host: str = "localhost"
    db_port: str = "5432"
    db_name: str = "loandb"
    db_username: str = "postgres"
    db_password: str = ""

    # Redis (optional)
    redis_url: str = "redis://localhost:6379/0"

    # Service identity
    service_name: str = "auth-service"
    service_port: int = 8001

    class Config:
        env_file = ".env"

    def get_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        if not self.db_password:
            raise RuntimeError(
                "DB_PASSWORD or DATABASE_URL must be set. "
                "In Workshop Studio it is injected from AWS Secrets Manager."
            )
        return (
            f"postgresql://{self.db_username}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    def validate_runtime(self) -> None:
        if not self.jwt_secret:
            raise RuntimeError(
                "JWT_SECRET is not set. Configure it via env or Secrets Manager."
            )


settings = Settings()
settings.validate_runtime()
