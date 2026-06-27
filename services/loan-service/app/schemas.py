"""Pydantic schemas for Loan Service."""

from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class LoanProductResponse(BaseModel):
    id: UUID
    name: str
    product_type: str
    min_amount: float
    max_amount: float
    interest_rate: float
    min_tenure_months: int
    max_tenure_months: int
    processing_fee_percent: float
    is_active: bool

    class Config:
        from_attributes = True


class LoanApplicationCreate(BaseModel):
    product_id: UUID
    amount: float
    tenure_months: int
    purpose: Optional[str] = None
    monthly_income: float
    existing_obligations: float = 0
    credit_score: float = 0
    employment_type: Optional[str] = None
    employment_years: float = 0
    collateral_value: float = 0


class LoanApplicationResponse(BaseModel):
    id: UUID
    customer_id: UUID
    product_id: UUID
    amount: float
    tenure_months: int
    purpose: Optional[str]
    status: str
    monthly_income: float
    credit_score: float
    created_at: datetime

    class Config:
        from_attributes = True


class PreQualifyRequest(BaseModel):
    monthly_income: float
    credit_score: float
    age: int
    existing_obligations: float = 0
    requested_amount: float
    product_type: str


class EligibilityResponse(BaseModel):
    id: UUID
    application_id: UUID
    is_eligible: bool
    max_eligible_amount: float
    reasons: List[str]
    score: float
    credit_score: Optional[float] = None
    checked_at: datetime

    class Config:
        from_attributes = True
