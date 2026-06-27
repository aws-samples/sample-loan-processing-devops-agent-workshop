"""API routes for Underwriting Service."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from .database import get_db
from .schemas import (
    AssessmentCreate, AssessmentResponse, DecisionCreate, DecisionResponse,
    UnderwritingCaseResponse,
)
from . import services

import sys
sys.path.insert(0, "/app")
from shared.middleware import get_current_user, require_role, TokenPayload

router = APIRouter(prefix="/api/v1/underwriting", tags=["underwriting"])


@router.post("/cases", response_model=UnderwritingCaseResponse)
def create_case(
    application_id: UUID,
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "LOAN_OFFICER")),
):
    return services.create_case(db, application_id, customer_id)


@router.get("/queue/maker", response_model=List[UnderwritingCaseResponse])
def get_maker_queue(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "UNDERWRITER")),
):
    return services.get_maker_queue(db)


@router.get("/queue/checker", response_model=List[UnderwritingCaseResponse])
def get_checker_queue(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "UNDERWRITER")),
):
    return services.get_checker_queue(db)


@router.post("/{app_id}/assess", response_model=AssessmentResponse)
def assess_application(
    app_id: UUID,
    data: AssessmentCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "UNDERWRITER")),
):
    result = services.assess_application(db, app_id, data, UUID(current_user.sub))
    if not result:
        raise HTTPException(status_code=404, detail="Underwriting case not found")
    return result


@router.post("/{app_id}/decide", response_model=DecisionResponse)
def decide_application(
    app_id: UUID,
    data: DecisionCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "UNDERWRITER")),
):
    try:
        result = services.decide_application(db, app_id, data, UUID(current_user.sub))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Underwriting case not found")
    return result
