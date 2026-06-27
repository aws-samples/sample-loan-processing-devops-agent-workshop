"""SQLAlchemy models for Disbursement Service."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer, Boolean, Date
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


class Disbursement(Base):
    __tablename__ = "disbursements"
    __table_args__ = {"schema": "disbursement"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    customer_id = Column(UUID(as_uuid=True), nullable=False)
    amount = Column(Float, nullable=False)
    disbursement_date = Column(DateTime, default=datetime.utcnow)
    bank_account = Column(String(50))
    ifsc_code = Column(String(20))
    reference_number = Column(String(100))
    status = Column(String(20), default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class LoanAgreement(Base):
    __tablename__ = "loan_agreements"
    __table_args__ = {"schema": "disbursement"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    application_id = Column(UUID(as_uuid=True), nullable=False)
    customer_id = Column(UUID(as_uuid=True), nullable=False)
    agreement_number = Column(String(50), unique=True)
    signed_at = Column(DateTime)
    document_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Loan(Base):
    __tablename__ = "loans"
    __table_args__ = {"schema": "disbursement"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    customer_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    product_type = Column(String(50), nullable=False)
    principal_amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False)
    tenure_months = Column(Integer, nullable=False)
    emi_amount = Column(Float, nullable=False)
    total_interest = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    outstanding_principal = Column(Float, nullable=False)
    status = Column(String(20), default="ACTIVE")
    disbursement_date = Column(Date, nullable=False)
    next_emi_date = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class EMIScheduleItem(Base):
    __tablename__ = "emi_schedule"
    __table_args__ = {"schema": "disbursement"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    installment_number = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    emi_amount = Column(Float, nullable=False)
    principal_component = Column(Float, nullable=False)
    interest_component = Column(Float, nullable=False)
    outstanding_after = Column(Float, nullable=False)
    status = Column(String(20), default="UPCOMING")
    paid_date = Column(Date)
