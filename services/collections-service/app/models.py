"""SQLAlchemy models for Collections Service."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


class CollectionsCase(Base):
    __tablename__ = "collections_cases"
    __table_args__ = {"schema": "collections"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    customer_id = Column(UUID(as_uuid=True), nullable=False)
    stage = Column(String(30), default="REMINDER")
    days_overdue = Column(Integer, default=0)
    total_overdue_amount = Column(Float, default=0)
    assigned_agent_id = Column(UUID(as_uuid=True))
    status = Column(String(20), default="ACTIVE")
    escalated_at = Column(DateTime)
    resolved_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CollectionsAction(Base):
    __tablename__ = "collections_actions"
    __table_args__ = {"schema": "collections"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    loan_id = Column(UUID(as_uuid=True), nullable=False)
    action_type = Column(String(50), nullable=False)
    notes = Column(String(1000))
    performed_by = Column(UUID(as_uuid=True), nullable=False)
    performed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
