"""Business logic for Loan Service."""

from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session
from . import models, schemas


def get_products(db: Session):
    return db.query(models.LoanProduct).filter(models.LoanProduct.is_active == True).all()  # noqa: E712  # nosemgrep: is-function-without-parentheses


def get_product(db: Session, product_id: UUID):
    return db.query(models.LoanProduct).filter(models.LoanProduct.id == product_id).first()


def create_application(db: Session, data: schemas.LoanApplicationCreate, customer_id: UUID):
    import random
    app = models.LoanApplication(customer_id=customer_id, **data.model_dump())
    # Auto-generate credit score for demo (650-800 range)
    app.credit_score = random.randint(680, 780)  # nosec B311 — simulated credit score for demo, not security-relevant
    # Auto-set status to SUBMITTED
    app.status = "SUBMITTED"
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def submit_application(db: Session, app_id: UUID):
    app = db.query(models.LoanApplication).filter(models.LoanApplication.id == app_id).first()
    if app:
        app.status = "SUBMITTED"
        app.submitted_at = datetime.utcnow()
        db.commit()
        db.refresh(app)
    return app


def get_application(db: Session, app_id: UUID):
    return db.query(models.LoanApplication).filter(models.LoanApplication.id == app_id).first()


def get_applications(db: Session, customer_id: UUID = None, skip: int = 0, limit: int = 50):
    query = db.query(models.LoanApplication)
    if customer_id:
        query = query.filter(models.LoanApplication.customer_id == customer_id)
    return query.order_by(models.LoanApplication.created_at.desc()).offset(skip).limit(limit).all()


def check_eligibility(db: Session, app_id: UUID) -> models.EligibilityResult:
    app = get_application(db, app_id)
    if not app:
        return None

    reasons = []
    score = 100.0
    is_eligible = True

    # Rule 1: Credit score check (auto-generated 680-780, so almost always passes)
    if app.credit_score < 600:
        reasons.append(f"Credit score ({app.credit_score}) below minimum (600)")
        score -= 30
        is_eligible = False
    elif app.credit_score >= 700:
        reasons.append(f"Credit score ({app.credit_score}) - Excellent")

    # Rule 2: Income to loan amount ratio
    if app.monthly_income and app.monthly_income > 0:
        annual_income = app.monthly_income * 12
        ratio = app.amount / annual_income
        if ratio > 5:
            reasons.append(f"Loan amount too high relative to income (ratio: {ratio:.1f}x, max: 5x)")
            score -= 25
            is_eligible = False
        else:
            reasons.append(f"Income-to-loan ratio: {ratio:.1f}x - Acceptable")
    else:
        reasons.append("Income information: using default assessment")

    # Rule 3: Loan amount within product limits
    product = db.query(models.LoanProduct).filter(models.LoanProduct.id == app.product_id).first()
    if product:
        if app.amount < product.min_amount or app.amount > product.max_amount:
            reasons.append(f"Amount ${app.amount:,.0f} outside product range (${product.min_amount:,.0f}-${product.max_amount:,.0f})")
            is_eligible = False
        else:
            reasons.append(f"Amount ${app.amount:,.0f} within product limits")

    if is_eligible:
        reasons.insert(0, "✅ All eligibility criteria met")

    max_eligible = (app.monthly_income * 12 * 5) if app.monthly_income else 0

    max_eligible = min(app.amount, app.monthly_income * 60) if is_eligible else 0

    result = models.EligibilityResult(
        application_id=app_id,
        customer_id=app.customer_id,
        is_eligible=is_eligible,
        max_eligible_amount=max_eligible,
        reasons=reasons,
        score=max(score, 0),
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    # Attach the applicant's credit score so the API response carries it
    # alongside the eligibility decision score. The model itself does
    # not persist this (it lives on LoanApplication), so we just decorate
    # the in-memory object before FastAPI serialises it.
    setattr(result, "credit_score", float(app.credit_score or 0))
    return result


def pre_qualify(data: schemas.PreQualifyRequest) -> dict:
    reasons = []
    is_eligible = True

    if data.age < 21 or data.age > 65:
        reasons.append(f"Age {data.age} outside eligible range (21-65)")
        is_eligible = False

    if data.credit_score < 600:
        reasons.append("Credit score below minimum (600)")
        is_eligible = False

    if data.monthly_income > 0:
        ratio = data.requested_amount / (data.monthly_income * 12)
        if ratio > 5:
            reasons.append(f"Amount to income ratio too high ({ratio:.1f}x)")
            is_eligible = False

    obligation_ratio = data.existing_obligations / data.monthly_income if data.monthly_income > 0 else 1
    if obligation_ratio > 0.5:
        reasons.append("Existing obligations exceed 50% of income")
        is_eligible = False

    max_amount = data.monthly_income * 60 if is_eligible else 0

    if not reasons:
        reasons.append("Pre-qualification criteria met")

    return {
        "is_eligible": is_eligible,
        "max_eligible_amount": max_amount,
        "reasons": reasons,
        "product_type": data.product_type,
    }


def seed_products(db: Session):
    """Seed default loan products."""
    existing = db.query(models.LoanProduct).count()
    if existing > 0:
        return

    products = [
        models.LoanProduct(
            name="Personal Loan", product_type="PERSONAL",
            min_amount=1000, max_amount=50000,
            interest_rate=12.5, min_tenure_months=6, max_tenure_months=60,
            processing_fee_percent=2.0,
        ),
        models.LoanProduct(
            name="Home Loan", product_type="HOME",
            min_amount=50000, max_amount=500000,
            interest_rate=7.5, min_tenure_months=12, max_tenure_months=360,
            processing_fee_percent=0.5,
        ),
        models.LoanProduct(
            name="Vehicle Loan", product_type="VEHICLE",
            min_amount=5000, max_amount=100000,
            interest_rate=9.5, min_tenure_months=12, max_tenure_months=84,
            processing_fee_percent=1.5,
        ),
    ]
    db.add_all(products)
    db.commit()
