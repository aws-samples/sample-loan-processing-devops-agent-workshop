"""Pydantic schemas for Underwriting Service."""

from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class AssessmentCreate(BaseModel):
    dti_ratio: float
    ltv_ratio: float
    credit_score: float
    employment_years: float
    recommendation: str  # APPROVE, REJECT, REFER
    conditions: List[str] = []
    notes: Optional[str] = None


class DecisionCreate(BaseModel):
    decision: str  # APPROVE, REJECT, REFER_BACK
    approved_amount: Optional[float] = None
    approved_rate: Optional[float] = None
    conditions: List[str] = []
    notes: Optional[str] = None


class UnderwritingCaseResponse(BaseModel):
    id: UUID
    application_id: UUID
    customer_id: UUID
    status: str
    assigned_maker: Optional[UUID]
    assigned_checker: Optional[UUID]
    created_at: datetime

    class Config:
        from_attributes = True


class AssessmentResponse(BaseModel):
    id: UUID
    application_id: UUID
    assessor_id: UUID
    dti_ratio: float
    ltv_ratio: float
    credit_score: float
    employment_years: float
    risk_score: float
    recommendation: str
    conditions: List[str]
    notes: Optional[str]
    assessed_at: datetime

    class Config:
        from_attributes = True


class DecisionResponse(BaseModel):
    id: UUID
    application_id: UUID
    decision_maker_id: UUID
    decision: str
    approved_amount: Optional[float]
    approved_rate: Optional[float]
    conditions: List[str]
    notes: Optional[str]
    decided_at: datetime

    class Config:
        from_attributes = True
