"""Pydantic schemas for Customer Service."""

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime


class CustomerCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    date_of_birth: date
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    employment_type: Optional[str] = None
    employer_name: Optional[str] = None
    monthly_income: Optional[float] = 0
    credit_score: Optional[float] = 0


class CustomerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    employment_type: Optional[str] = None
    employer_name: Optional[str] = None
    monthly_income: Optional[float] = None
    credit_score: Optional[float] = None


class CustomerResponse(BaseModel):
    id: UUID
    user_id: UUID
    first_name: str
    last_name: str
    email: str
    phone: str
    date_of_birth: date
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    pincode: Optional[str]
    employment_type: Optional[str]
    employer_name: Optional[str]
    monthly_income: float
    credit_score: float
    kyc_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class KYCDocumentCreate(BaseModel):
    document_type: str
    document_number: str
    file_url: Optional[str] = None


class KYCSubmitRequest(BaseModel):
    documents: List[KYCDocumentCreate]


class KYCSubmissionResponse(BaseModel):
    id: UUID
    customer_id: UUID
    status: str
    submitted_at: datetime
    verified_at: Optional[datetime]

    class Config:
        from_attributes = True
