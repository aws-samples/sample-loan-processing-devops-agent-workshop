"""Configuration settings for Dashboard Service."""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "demo-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    service_name: str = "dashboard-service"
    service_port: int = 8010

    # Individual DB params (from ECS Secrets Manager)
    db_host: str = "localhost"
    db_port: str = "5432"
    db_name: str = "loandb"
    db_username: str = "postgres"
    db_password: str = "postgres123"

    class Config:
        env_file = ".env"

    def get_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"postgresql://{self.db_username}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"


settings = Settings()
