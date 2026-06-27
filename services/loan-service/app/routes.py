"""API routes for Loan Service."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess  # nosec B404 — only invoked from the ALLOW_STRESS_TEST=true gated /stress-test endpoint with hard-coded args, no user input
import threading
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from middleware import (  # type: ignore  # shared JWT middleware
    TokenPayload,
    get_current_user,
    require_role,
)

from . import services
from .database import get_db
from .schemas import (
    EligibilityResponse,
    LoanApplicationCreate,
    LoanApplicationResponse,
    LoanProductResponse,
    PreQualifyRequest,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["loans"])


_STAFF_ROLES = ("ADMIN", "LOAN_OFFICER", "UNDERWRITER")


def _is_staff(user: TokenPayload) -> bool:
    return "admin:all" in user.permissions or user.role in _STAFF_ROLES


@router.get("/loan-products", response_model=List[LoanProductResponse])
def list_products(db: Session = Depends(get_db)):
    return services.get_products(db)


@router.post("/applications", response_model=LoanApplicationResponse)
def create_application(
    data: LoanApplicationCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.create_application(db, data, UUID(current_user.sub))


@router.get("/applications", response_model=List[LoanApplicationResponse])
def list_applications(
    customer_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """List applications.

    Customers can only see their own applications. Staff (ADMIN, LOAN_OFFICER,
    UNDERWRITER) can pass an explicit ``customer_id`` filter or omit it to
    list all.
    """
    if _is_staff(current_user):
        return services.get_applications(db, customer_id, skip, limit)

    # Non-staff users are pinned to their own customer_id
    own_customer_id = UUID(current_user.sub)
    if customer_id is not None and customer_id != own_customer_id:
        raise HTTPException(status_code=403, detail="Cannot view another customer's applications")
    return services.get_applications(db, own_customer_id, skip, limit)


@router.get("/applications/{app_id}", response_model=LoanApplicationResponse)
def get_application(
    app_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    app = services.get_application(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if not _is_staff(current_user) and str(app.customer_id) != current_user.sub:
        raise HTTPException(status_code=403, detail="Not authorized to view this application")
    return app


@router.post("/applications/{app_id}/submit", response_model=LoanApplicationResponse)
def submit_application(
    app_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    app = services.get_application(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if not _is_staff(current_user) and str(app.customer_id) != current_user.sub:
        raise HTTPException(status_code=403, detail="Not authorized to submit this application")
    return services.submit_application(db, app_id)


@router.post("/applications/{app_id}/eligibility", response_model=EligibilityResponse)
def check_eligibility(
    app_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "LOAN_OFFICER")),
):
    result = services.check_eligibility(db, app_id)
    if not result:
        raise HTTPException(status_code=404, detail="Application not found")
    return result


@router.post("/eligibility/pre-qualify")
def pre_qualify(
    data: PreQualifyRequest,
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.pre_qualify(data)


@router.put("/applications/{app_id}/status")
def update_application_status(
    app_id: UUID,
    data: dict,
    current_user: TokenPayload = Depends(require_role("ADMIN", "UNDERWRITER")),
    db: Session = Depends(get_db),
):
    """Update application status — ADMIN or UNDERWRITER only."""
    app = services.get_application(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    new_status = str(data.get("status", "")).upper()
    valid = {"SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "DISBURSED", "ACTIVE", "CLOSED"}
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {sorted(valid)}")
    app.status = new_status
    db.commit()
    db.refresh(app)
    logger.info(
        "application_status_changed app_id=%s status=%s actor=%s",
        app_id, new_status, current_user.username,
    )
    return app


@router.post("/applications/db-pool-stress")
def trigger_db_pool_stress(
    holders: int = 50,
    hold_seconds: int = 60,
    current_user: TokenPayload = Depends(require_role("ADMIN")),
):
    """Hold N PostgreSQL connections open to exhaust the RDS connection pool.

    Used by the workshop's Lab 1 ("RDS connection pool exhaustion"). Each
    background thread opens a fresh DB connection (bypassing SQLAlchemy's
    pool to force NEW server-side connections) and sleeps for ``hold_seconds``
    before closing.

    Disabled by default. Set ``ALLOW_STRESS_TEST=true`` at the service to
    enable. Should never be enabled in any production-like environment.

    What the agent sees:
      - AWS/RDS DatabaseConnections climbing toward the instance limit
      - Service container logs: "QueuePool limit ... reached"
      - HTTP 5xx on POST /applications and POST /applications/{id}/eligibility
        because new application writes can no longer get a connection
    """
    if os.getenv("ALLOW_STRESS_TEST", "false").lower() != "true":
        raise HTTPException(
            status_code=403,
            detail=(
                "DB pool stress endpoint is disabled. "
                "Set ALLOW_STRESS_TEST=true on the loan-service to enable for the workshop."
            ),
        )

    holders = max(1, min(int(holders), 200))
    hold_seconds = max(5, min(int(hold_seconds), 600))

    def hold_one_connection() -> None:
        # Use a brand-new psycopg2 connection (bypasses SQLAlchemy's pool)
        # so each holder consumes a real RDS server-side connection slot.
        try:
            import time
            import psycopg2  # type: ignore
            from .config import settings as _settings

            conn = psycopg2.connect(
                host=_settings.db_host,
                port=int(_settings.db_port),
                dbname=_settings.db_name,
                user=_settings.db_username,
                password=_settings.db_password,
                connect_timeout=5,
            )
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_sleep(%s)", (hold_seconds,))
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("db_pool_holder_failed: %s", exc)

    for _ in range(holders):
        threading.Thread(target=hold_one_connection, daemon=True).start()

    logger.warning(
        "db_pool_stress_triggered actor=%s holders=%s hold_seconds=%s",
        current_user.username, holders, hold_seconds,
    )

    return {
        "status": "started",
        "message": (
            f"Holding {holders} PostgreSQL connections open for {hold_seconds}s. "
            "Watch CloudWatch alarm LoanMgmt-RDS-HighConnections."
        ),
        "scenario": "Batch credit-score recalculation saturating the RDS connection pool",
    }


@router.post("/applications/stress-test")
def trigger_stress_test(
    duration: int = 120,
    cpu_workers: int = 2,
    current_user: TokenPayload = Depends(require_role("ADMIN")),
):
    """Trigger CPU stress (admin-only chaos engineering hook, kept for legacy).

    Disabled by default. Set ALLOW_STRESS_TEST=true at the service to enable.
    Should never be enabled in any production-like environment.
    """
    if os.getenv("ALLOW_STRESS_TEST", "false").lower() != "true":
        raise HTTPException(
            status_code=403,
            detail=(
                "Stress test endpoint is disabled. "
                "Set ALLOW_STRESS_TEST=true on the loan-service to enable for the workshop."
            ),
        )

    if not shutil.which("stress-ng"):
        raise HTTPException(
            status_code=503,
            detail="stress-ng is not installed in this image.",
        )

    duration = max(1, min(int(duration), 300))
    cpu_workers = max(1, min(int(cpu_workers), 4))

    def run_stress():
        try:
            subprocess.run(  # nosec B603 B607 — ADMIN-only, ALLOW_STRESS_TEST-gated; argv is hard-coded with bounded ints, no user-supplied strings interpolated
                ["stress-ng", "--cpu", str(cpu_workers), "--cpu-load", "95", "--timeout", f"{duration}s"],
                capture_output=True,
                check=False,
                timeout=duration + 30,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("stress-ng run failed: %s", exc)

    threading.Thread(target=run_stress, daemon=True).start()
    logger.warning(
        "stress_test_triggered actor=%s duration=%ss workers=%s",
        current_user.username, duration, cpu_workers,
    )

    return {
        "status": "started",
        "message": f"CPU stress test started: {cpu_workers} workers at 95% load for {duration}s",
    }
