"""API routes for Dashboard Service."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .database import get_db
from .schemas import DashboardSummary, PipelineMetrics, CollectionsMetrics, DisbursementMetrics
from . import services

import sys
sys.path.insert(0, "/app")
from shared.middleware import get_current_user, require_role, TokenPayload

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "LOAN_OFFICER")),
):
    return services.get_summary(db)


@router.get("/pipeline", response_model=PipelineMetrics)
def get_pipeline(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "LOAN_OFFICER")),
):
    return services.get_pipeline(db)


@router.get("/collections", response_model=CollectionsMetrics)
def get_collections(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "COLLECTIONS_AGENT")),
):
    return services.get_collections_metrics(db)


@router.get("/disbursements", response_model=DisbursementMetrics)
def get_disbursements(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "LOAN_OFFICER")),
):
    return services.get_disbursement_metrics(db)
