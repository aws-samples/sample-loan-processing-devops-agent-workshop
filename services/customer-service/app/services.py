"""Business logic for Customer Service."""

import asyncio
import threading
from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session
from . import models, schemas


def create_customer(db: Session, data: schemas.CustomerCreate, user_id: UUID) -> models.Customer:
    customer = models.Customer(user_id=user_id, **data.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def get_customer(db: Session, customer_id: UUID) -> models.Customer:
    return db.query(models.Customer).filter(models.Customer.id == customer_id).first()


def get_customer_by_user(db: Session, user_id: UUID) -> models.Customer:
    return db.query(models.Customer).filter(models.Customer.user_id == user_id).first()


def get_customers(db: Session, skip: int = 0, limit: int = 50):
    return db.query(models.Customer).offset(skip).limit(limit).all()


def update_customer(db: Session, customer_id: UUID, data: schemas.CustomerUpdate) -> models.Customer:
    customer = get_customer(db, customer_id)
    if not customer:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(customer)
    return customer


def submit_kyc(db: Session, customer_id: UUID, data: schemas.KYCSubmitRequest) -> models.KYCSubmission:
    # Create KYC documents
    for doc in data.documents:
        kyc_doc = models.KYCDocument(
            customer_id=customer_id,
            document_type=doc.document_type,
            document_number=doc.document_number,
            file_url=doc.file_url,
        )
        db.add(kyc_doc)

    # Create submission
    submission = models.KYCSubmission(customer_id=customer_id, status="PENDING")
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # Simulate async verification (auto-verify after delay)
    _simulate_verification(customer_id, submission.id)
    return submission


def _simulate_verification(customer_id: UUID, submission_id: UUID):
    """Simulate KYC verification with a background thread."""
    def verify():
        # Simulated KYC processing delay — no actual sleep needed for demo
        from .database import SessionLocal
        db = SessionLocal()
        try:
            submission = db.query(models.KYCSubmission).filter(
                models.KYCSubmission.id == submission_id
            ).first()
            if submission:
                submission.status = "VERIFIED"
                submission.verified_at = datetime.utcnow()
            customer = db.query(models.Customer).filter(
                models.Customer.id == customer_id
            ).first()
            if customer:
                customer.kyc_status = "VERIFIED"
            # Update all documents
            docs = db.query(models.KYCDocument).filter(
                models.KYCDocument.customer_id == customer_id,
                models.KYCDocument.status == "PENDING"
            ).all()
            for doc in docs:
                doc.status = "VERIFIED"
                doc.verified_at = datetime.utcnow()
            db.commit()
        finally:
            db.close()

    thread = threading.Thread(target=verify, daemon=True)
    thread.start()


def get_pending_kyc(db: Session):
    return db.query(models.KYCSubmission).filter(
        models.KYCSubmission.status == "PENDING"
    ).all()
