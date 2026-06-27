"""Pydantic schemas for Collections Service."""

from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class CollectionsCaseResponse(BaseModel):
    id: UUID
    loan_id: UUID
    customer_id: UUID
    stage: str
    days_overdue: int
    total_overdue_amount: float
    assigned_agent_id: Optional[UUID]
    status: str
    escalated_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class EscalateRequest(BaseModel):
    reason: Optional[str] = None


class ActionCreate(BaseModel):
    action_type: str  # CALL, SMS, EMAIL, VISIT, LEGAL_NOTICE
    notes: Optional[str] = None


class ActionResponse(BaseModel):
    id: UUID
    case_id: UUID
    loan_id: UUID
    action_type: str
    notes: Optional[str]
    performed_by: UUID
    performed_at: datetime

    class Config:
        from_attributes = True


class CollectionsSummary(BaseModel):
    total_cases: int
    active_cases: int
    reminder_stage: int
    overdue_notice_stage: int
    legal_notice_stage: int
    resolved: int
    total_overdue_amount: float
