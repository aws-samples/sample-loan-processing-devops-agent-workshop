"""SQLAlchemy models for Repayment Service."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer, Boolean, Date
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = {"schema": "repayments"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    customer_id = Column(UUID(as_uuid=True), nullable=False)
    installment_number = Column(Integer)
    amount = Column(Float, nullable=False)
    payment_method = Column(String(30), default="BANK_TRANSFER")
    payment_type = Column(String(20), default="EMI")  # EMI, PREPAYMENT, PENALTY
    reference_number = Column(String(100))
    status = Column(String(20), default="SUCCESS")
    paid_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Penalty(Base):
    __tablename__ = "penalties"
    __table_args__ = {"schema": "repayments"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    installment_number = Column(Integer, nullable=False)
    days_overdue = Column(Integer, nullable=False)
    penalty_amount = Column(Float, nullable=False)
    penalty_rate = Column(Float, default=2.0)
    is_paid = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
