"""API routes for Collections Service."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from .database import get_db
from .schemas import (
    CollectionsCaseResponse, EscalateRequest, ActionCreate,
    ActionResponse, CollectionsSummary,
)
from . import models, services

import sys
sys.path.insert(0, "/app")
from shared.middleware import get_current_user, require_role, TokenPayload

router = APIRouter(prefix="/api/v1/collections", tags=["collections"])


@router.get("", response_model=List[CollectionsCaseResponse])
def list_cases(
    status: str = None,
    stage: str = None,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "COLLECTIONS_AGENT")),
):
    return services.get_cases(db, status, stage)


@router.post("/seed-demo-case", response_model=CollectionsCaseResponse)
def seed_demo_case(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "COLLECTIONS_AGENT")),
):
    """Insert a synthetic active collections case for demos.

    The collections-service normally creates cases automatically when an
    EMI goes overdue. The workshop demo flow does not naturally produce
    overdue EMIs in real time, so this endpoint lets the operator
    bootstrap a case for the demonstration. ADMIN/COLLECTIONS_AGENT only.
    """
    case = models.CollectionsCase(
        loan_id=uuid.uuid4(),
        customer_id=uuid.uuid4(),
        stage="REMINDER",
        days_overdue=12,
        total_overdue_amount=42500.0,
        status="ACTIVE",
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.post("/{loan_id}/escalate", response_model=CollectionsCaseResponse)
def escalate_case(
    loan_id: UUID,
    data: EscalateRequest = None,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "COLLECTIONS_AGENT")),
):
    result = services.escalate_case(db, loan_id, UUID(current_user.sub))
    if not result:
        raise HTTPException(status_code=404, detail="Active collections case not found")
    return result


@router.post("/{loan_id}/action", response_model=ActionResponse)
def add_action(
    loan_id: UUID,
    data: ActionCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "COLLECTIONS_AGENT")),
):
    result = services.add_action(db, loan_id, data, UUID(current_user.sub))
    if not result:
        raise HTTPException(status_code=404, detail="Active collections case not found")
    return result


@router.get("/summary", response_model=CollectionsSummary)
def get_summary(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "COLLECTIONS_AGENT")),
):
    return services.get_summary(db)
