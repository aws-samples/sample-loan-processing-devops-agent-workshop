"""Pydantic schemas for Disbursement Service."""

from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime


class DisbursementCreate(BaseModel):
    application_id: UUID
    customer_id: UUID
    amount: float
    interest_rate: float
    tenure_months: int
    product_type: str
    bank_account: Optional[str] = None
    ifsc_code: Optional[str] = None


class DisbursementResponse(BaseModel):
    id: UUID
    application_id: UUID
    customer_id: UUID
    amount: float
    disbursement_date: datetime
    status: str
    reference_number: Optional[str]

    class Config:
        from_attributes = True


class LoanResponse(BaseModel):
    id: UUID
    application_id: UUID
    customer_id: UUID
    product_type: str
    principal_amount: float
    interest_rate: float
    tenure_months: int
    emi_amount: float
    total_interest: float
    total_amount: float
    outstanding_principal: float
    status: str
    disbursement_date: date
    next_emi_date: Optional[date]

    class Config:
        from_attributes = True


class EMIScheduleResponse(BaseModel):
    id: UUID
    loan_id: UUID
    installment_number: int
    due_date: date
    emi_amount: float
    principal_component: float
    interest_component: float
    outstanding_after: float
    status: str
    paid_date: Optional[date]

    class Config:
        from_attributes = True


class LoanAgreementResponse(BaseModel):
    id: UUID
    loan_id: UUID
    application_id: UUID
    agreement_number: Optional[str]
    signed_at: Optional[datetime]

    class Config:
        from_attributes = True
