"""SQLAlchemy models for Loan Service."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer, Boolean, JSON
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


class LoanProduct(Base):
    __tablename__ = "loan_products"
    __table_args__ = {"schema": "loans"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    product_type = Column(String(50), nullable=False)
    min_amount = Column(Float, nullable=False)
    max_amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False)
    min_tenure_months = Column(Integer, default=6)
    max_tenure_months = Column(Integer, default=360)
    processing_fee_percent = Column(Float, default=1.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class LoanApplication(Base):
    __tablename__ = "loan_applications"
    __table_args__ = {"schema": "loans"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), nullable=False)
    amount = Column(Float, nullable=False)
    tenure_months = Column(Integer, nullable=False)
    purpose = Column(String(500))
    status = Column(String(30), default="DRAFT")
    monthly_income = Column(Float, default=0)
    existing_obligations = Column(Float, default=0)
    credit_score = Column(Float, default=0)
    employment_type = Column(String(50))
    employment_years = Column(Float, default=0)
    collateral_value = Column(Float, default=0)
    submitted_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EligibilityResult(Base):
    __tablename__ = "eligibility_results"
    __table_args__ = {"schema": "loans"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    customer_id = Column(UUID(as_uuid=True), nullable=False)
    is_eligible = Column(Boolean, nullable=False)
    max_eligible_amount = Column(Float, default=0)
    reasons = Column(JSON, default=list)
    score = Column(Float, default=0)
    checked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
