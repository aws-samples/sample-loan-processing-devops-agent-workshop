"""API routes for Disbursement Service."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from .database import get_db
from .schemas import (
    DisbursementCreate, DisbursementResponse, LoanResponse,
    EMIScheduleResponse, LoanAgreementResponse,
)
from . import services

import sys
sys.path.insert(0, "/app")
from shared.middleware import get_current_user, require_role, TokenPayload

router = APIRouter(prefix="/api/v1", tags=["disbursement"])


@router.post("/disbursements/{app_id}", response_model=DisbursementResponse)
def disburse_loan(
    app_id: UUID,
    data: DisbursementCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "LOAN_OFFICER")),
):
    return services.disburse_loan(db, data)


@router.get("/disbursements/{app_id}", response_model=DisbursementResponse)
def get_disbursement(
    app_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = services.get_disbursement(db, app_id)
    if not result:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return result


@router.get("/loans", response_model=List[LoanResponse])
def list_loans(
    customer_id: UUID = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.get_loans(db, customer_id, skip, limit)


@router.get("/loans/{loan_id}", response_model=LoanResponse)
def get_loan(
    loan_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    loan = services.get_loan(db, loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    return loan


@router.get("/loans/{loan_id}/schedule", response_model=List[EMIScheduleResponse])
def get_emi_schedule(
    loan_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.get_emi_schedule(db, loan_id)


@router.get("/loans/{loan_id}/agreement", response_model=LoanAgreementResponse)
def get_agreement(
    loan_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    agreement = services.get_agreement(db, loan_id)
    if not agreement:
        raise HTTPException(status_code=404, detail="Agreement not found")
    return agreement
