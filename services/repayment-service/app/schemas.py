"""Pydantic schemas for Repayment Service."""

from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime, date


class PaymentCreate(BaseModel):
    amount: float
    payment_method: str = "BANK_TRANSFER"
    installment_number: Optional[int] = None


class PrepaymentCreate(BaseModel):
    amount: float
    payment_method: str = "BANK_TRANSFER"


class AutoDebitSetup(BaseModel):
    bank_account: str
    ifsc_code: str
    mandate_id: Optional[str] = None


class PaymentResponse(BaseModel):
    id: UUID
    loan_id: UUID
    customer_id: UUID
    installment_number: Optional[int]
    amount: float
    payment_method: str
    payment_type: str
    reference_number: Optional[str]
    status: str
    paid_at: datetime

    class Config:
        from_attributes = True


class PenaltyResponse(BaseModel):
    id: UUID
    loan_id: UUID
    installment_number: int
    days_overdue: int
    penalty_amount: float
    penalty_rate: float
    is_paid: bool

    class Config:
        from_attributes = True


class OverdueItem(BaseModel):
    loan_id: UUID
    installment_number: int
    due_date: date
    emi_amount: float
    days_overdue: int
    penalty_amount: float
