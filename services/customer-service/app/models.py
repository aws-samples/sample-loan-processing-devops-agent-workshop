"""SQLAlchemy models for Customer Service."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Date, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .database import Base


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = {"schema": "customers"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    phone = Column(String(20), nullable=False)
    date_of_birth = Column(Date, nullable=False)
    address = Column(String(500))
    city = Column(String(100))
    state = Column(String(100))
    pincode = Column(String(10))
    employment_type = Column(String(50))
    employer_name = Column(String(200))
    monthly_income = Column(Float, default=0)
    credit_score = Column(Float, default=0)
    kyc_status = Column(String(20), default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    kyc_documents = relationship("KYCDocument", back_populates="customer")


class KYCDocument(Base):
    __tablename__ = "kyc_documents"
    __table_args__ = {"schema": "customers"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.customers.id"), nullable=False)
    document_type = Column(String(50), nullable=False)
    document_number = Column(String(100), nullable=False)
    file_url = Column(String(500))
    status = Column(String(20), default="PENDING")
    verified_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="kyc_documents")


class KYCSubmission(Base):
    __tablename__ = "kyc_submissions"
    __table_args__ = {"schema": "customers"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.customers.id"), nullable=False)
    status = Column(String(20), default="PENDING")
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    verified_at = Column(DateTime)
    rejection_reason = Column(String(500))
