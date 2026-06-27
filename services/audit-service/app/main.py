"""Audit Service - FastAPI Application Entry Point."""

from fastapi import FastAPI

from security import install_security_middleware  # type: ignore

from .config import settings
from .database import Base, engine
from .kyc_archive import router as kyc_router
from .routes import router


app = FastAPI(title="Audit Service", version="1.0.0")
install_security_middleware(app)
app.include_router(router)
app.include_router(kyc_router)


@app.on_event("startup")
def startup() -> None:
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS audit"))
        conn.commit()
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check() -> dict:
    return {"status": "healthy", "service": settings.service_name}
