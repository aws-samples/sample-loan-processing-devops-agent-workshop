"""Dashboard Service - FastAPI Application Entry Point."""

from fastapi import FastAPI

from security import install_security_middleware  # type: ignore

from .config import settings
from .routes import router


app = FastAPI(title="Dashboard Service", version="1.0.0")
install_security_middleware(app)
app.include_router(router)


@app.get("/health")
def health_check() -> dict:
    return {"status": "healthy", "service": settings.service_name}
