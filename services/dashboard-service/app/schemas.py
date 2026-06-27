"""Pydantic schemas for Dashboard Service."""

from pydantic import BaseModel
from typing import Optional, List, Dict


class DashboardSummary(BaseModel):
    total_customers: int
    total_applications: int
    pending_applications: int
    approved_applications: int
    rejected_applications: int
    active_loans: int
    total_disbursed: float
    total_collections_cases: int
    overdue_amount: float


class PipelineMetrics(BaseModel):
    draft: int
    submitted: int
    under_review: int
    approved: int
    rejected: int
    disbursed: int


class CollectionsMetrics(BaseModel):
    total_active: int
    reminder_stage: int
    overdue_notice_stage: int
    legal_notice_stage: int
    total_overdue_amount: float
    resolved_this_month: int


class DisbursementMetrics(BaseModel):
    total_disbursed_count: int
    total_disbursed_amount: float
    this_month_count: int
    this_month_amount: float
    by_product_type: Dict[str, float]
