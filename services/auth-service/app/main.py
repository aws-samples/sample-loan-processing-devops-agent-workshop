"""Auth Service - FastAPI Application Entry Point."""

import os

from fastapi import FastAPI

from security import install_security_middleware  # type: ignore  # shared module

from .config import settings
from .database import Base, engine
from .routes import install_rate_limiter, router
from .seed import seed_data


app = FastAPI(
    title="Auth Service",
    description="User authentication, authorization, and session management",
    version="1.0.0",
)

install_security_middleware(app)
install_rate_limiter(app)
app.include_router(router)


@app.on_event("startup")
def startup() -> None:
    """Create schemas, tables and (optionally) seed demo data on startup."""
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS auth"))
        conn.commit()
    Base.metadata.create_all(bind=engine)

    if os.getenv("ENABLE_DEMO_SEED", "false").lower() == "true":
        seed_data()


@app.get("/health")
def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy", "service": settings.service_name}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.service_port)  # nosec B104 — bound inside ECS task; ALB-only ingress
