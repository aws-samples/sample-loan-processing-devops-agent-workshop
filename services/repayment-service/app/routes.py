"""API routes for Repayment Service."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from .database import get_db
from .schemas import (
    PaymentCreate, PaymentResponse, PrepaymentCreate,
    AutoDebitSetup,
)
from . import services

import sys
sys.path.insert(0, "/app")
from shared.middleware import get_current_user, require_role, TokenPayload

router = APIRouter(prefix="/api/v1/repayments", tags=["repayments"])


@router.get("/{loan_id}/schedule")
def get_schedule(
    loan_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.get_schedule(db, loan_id)


@router.post("/{loan_id}/pay", response_model=PaymentResponse)
def make_payment(
    loan_id: UUID,
    data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.make_payment(db, loan_id, UUID(current_user.sub), data)


@router.post("/{loan_id}/auto-debit")
def auto_debit(
    loan_id: UUID,
    data: AutoDebitSetup,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.process_auto_debit(db, loan_id, UUID(current_user.sub), data)


@router.post("/{loan_id}/prepay", response_model=PaymentResponse)
def prepay(
    loan_id: UUID,
    data: PrepaymentCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.make_prepayment(db, loan_id, UUID(current_user.sub), data)


@router.get("/overdue")
def get_overdue(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "LOAN_OFFICER", "COLLECTIONS_AGENT")),
):
    return services.get_overdue(db)
