"""API routes for Customer Service."""

from __future__ import annotations

from typing import List
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
    CustomerCreate,
    CustomerResponse,
    CustomerUpdate,
    KYCSubmissionResponse,
    KYCSubmitRequest,
)


router = APIRouter(prefix="/api/v1", tags=["customers"])

_STAFF_ROLES = ("ADMIN", "LOAN_OFFICER", "UNDERWRITER")


def _is_staff(user: TokenPayload) -> bool:
    return "admin:all" in user.permissions or user.role in _STAFF_ROLES


def _ensure_owner_or_staff(db: Session, customer_id: UUID, current_user: TokenPayload):
    if _is_staff(current_user):
        return
    customer = services.get_customer(db, customer_id)
    if not customer or str(customer.user_id) != current_user.sub:
        raise HTTPException(status_code=403, detail="Not authorized for this customer")


@router.post("/customers", response_model=CustomerResponse)
def create_customer(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.create_customer(db, data, UUID(current_user.sub))


@router.get("/customers", response_model=List[CustomerResponse])
def list_customers(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role(*_STAFF_ROLES)),
):
    """List customers — staff only (ADMIN, LOAN_OFFICER, UNDERWRITER)."""
    return services.get_customers(db, skip, limit)


@router.get("/customers/me", response_model=CustomerResponse)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    customer = services.get_customer_by_user(db, UUID(current_user.sub))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer profile not found")
    return customer


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
def get_customer(
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _ensure_owner_or_staff(db, customer_id, current_user)
    customer = services.get_customer(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.put("/customers/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: UUID,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _ensure_owner_or_staff(db, customer_id, current_user)
    customer = services.update_customer(db, customer_id, data)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.post("/customers/{customer_id}/kyc", response_model=KYCSubmissionResponse)
def submit_kyc(
    customer_id: UUID,
    data: KYCSubmitRequest,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _ensure_owner_or_staff(db, customer_id, current_user)
    customer = services.get_customer(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return services.submit_kyc(db, customer_id, data)


@router.get("/kyc/pending", response_model=List[KYCSubmissionResponse])
def get_pending_kyc(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("ADMIN", "LOAN_OFFICER")),
):
    return services.get_pending_kyc(db)
