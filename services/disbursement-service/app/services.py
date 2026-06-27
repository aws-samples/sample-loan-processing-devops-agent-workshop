"""Business logic for Disbursement Service."""

import uuid
from datetime import datetime, date, timedelta
from uuid import UUID
from sqlalchemy.orm import Session
from . import models, schemas


def calculate_emi(principal: float, annual_rate: float, tenure_months: int) -> float:
    """EMI = P * r * (1+r)^n / ((1+r)^n - 1)"""
    if annual_rate == 0:
        return principal / tenure_months
    r = annual_rate / (12 * 100)  # Monthly rate
    n = tenure_months
    emi = principal * r * ((1 + r) ** n) / (((1 + r) ** n) - 1)
    return round(emi, 2)


def disburse_loan(db: Session, data: schemas.DisbursementCreate) -> dict:
    """Create disbursement, loan, and EMI schedule."""
    # Create disbursement record
    ref_number = f"DISB-{uuid.uuid4().hex[:8].upper()}"
    disbursement = models.Disbursement(
        application_id=data.application_id,
        customer_id=data.customer_id,
        amount=data.amount,
        bank_account=data.bank_account,
        ifsc_code=data.ifsc_code,
        reference_number=ref_number,
        status="COMPLETED",
    )
    db.add(disbursement)

    # Calculate EMI
    emi = calculate_emi(data.amount, data.interest_rate, data.tenure_months)
    total_amount = emi * data.tenure_months
    total_interest = total_amount - data.amount

    # Create loan record
    today = date.today()
    loan = models.Loan(
        application_id=data.application_id,
        customer_id=data.customer_id,
        product_type=data.product_type,
        principal_amount=data.amount,
        interest_rate=data.interest_rate,
        tenure_months=data.tenure_months,
        emi_amount=emi,
        total_interest=round(total_interest, 2),
        total_amount=round(total_amount, 2),
        outstanding_principal=data.amount,
        disbursement_date=today,
        next_emi_date=today + timedelta(days=30),
    )
    db.add(loan)
    db.flush()

    # Generate EMI schedule
    outstanding = data.amount
    r = data.interest_rate / (12 * 100)
    emi_date = today + timedelta(days=30)

    for i in range(1, data.tenure_months + 1):
        interest_component = round(outstanding * r, 2)
        principal_component = round(emi - interest_component, 2)
        outstanding = round(outstanding - principal_component, 2)
        if outstanding < 0:
            outstanding = 0

        schedule_item = models.EMIScheduleItem(
            loan_id=loan.id,
            installment_number=i,
            due_date=emi_date,
            emi_amount=emi,
            principal_component=principal_component,
            interest_component=interest_component,
            outstanding_after=outstanding,
        )
        db.add(schedule_item)
        emi_date = emi_date + timedelta(days=30)

    # Create agreement
    agreement = models.LoanAgreement(
        loan_id=loan.id,
        application_id=data.application_id,
        customer_id=data.customer_id,
        agreement_number=f"AGR-{uuid.uuid4().hex[:8].upper()}",
        signed_at=datetime.utcnow(),
    )
    db.add(agreement)

    db.commit()
    db.refresh(disbursement)
    return disbursement


def get_disbursement(db: Session, application_id: UUID):
    return db.query(models.Disbursement).filter(
        models.Disbursement.application_id == application_id
    ).first()


def get_loans(db: Session, customer_id: UUID = None, skip: int = 0, limit: int = 50):
    query = db.query(models.Loan)
    if customer_id:
        query = query.filter(models.Loan.customer_id == customer_id)
    return query.offset(skip).limit(limit).all()


def get_loan(db: Session, loan_id: UUID):
    return db.query(models.Loan).filter(models.Loan.id == loan_id).first()


def get_emi_schedule(db: Session, loan_id: UUID):
    return db.query(models.EMIScheduleItem).filter(
        models.EMIScheduleItem.loan_id == loan_id
    ).order_by(models.EMIScheduleItem.installment_number).all()


def get_agreement(db: Session, loan_id: UUID):
    return db.query(models.LoanAgreement).filter(
        models.LoanAgreement.loan_id == loan_id
    ).first()
