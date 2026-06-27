"""SQLAlchemy models for Underwriting Service."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Boolean, JSON
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


class UnderwritingCase(Base):
    __tablename__ = "underwriting_cases"
    __table_args__ = {"schema": "underwriting"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    customer_id = Column(UUID(as_uuid=True), nullable=False)
    status = Column(String(30), default="PENDING_ASSESSMENT")
    assigned_maker = Column(UUID(as_uuid=True))
    assigned_checker = Column(UUID(as_uuid=True))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = {"schema": "underwriting"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    assessor_id = Column(UUID(as_uuid=True), nullable=False)
    dti_ratio = Column(Float)
    ltv_ratio = Column(Float)
    credit_score = Column(Float)
    employment_years = Column(Float)
    risk_score = Column(Float, default=0)
    recommendation = Column(String(20))
    conditions = Column(JSON, default=list)
    notes = Column(String(1000))
    assessed_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Decision(Base):
    __tablename__ = "decisions"
    __table_args__ = {"schema": "underwriting"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    decision_maker_id = Column(UUID(as_uuid=True), nullable=False)
    decision = Column(String(20), nullable=False)
    approved_amount = Column(Float)
    approved_rate = Column(Float)
    conditions = Column(JSON, default=list)
    notes = Column(String(1000))
    decided_at = Column(DateTime, default=datetime.utcnow, nullable=False)
