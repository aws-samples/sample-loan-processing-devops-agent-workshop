"""Business logic for Underwriting Service."""

from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session
from . import models, schemas


def create_case(db: Session, application_id: UUID, customer_id: UUID) -> models.UnderwritingCase:
    case = models.UnderwritingCase(application_id=application_id, customer_id=customer_id)
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def get_maker_queue(db: Session):
    return db.query(models.UnderwritingCase).filter(
        models.UnderwritingCase.status == "PENDING_ASSESSMENT"
    ).all()


def get_checker_queue(db: Session):
    return db.query(models.UnderwritingCase).filter(
        models.UnderwritingCase.status == "PENDING_DECISION"
    ).all()


def assess_application(
    db: Session, application_id: UUID, data: schemas.AssessmentCreate, assessor_id: UUID
) -> models.Assessment:
    # Get or create case
    case = db.query(models.UnderwritingCase).filter(
        models.UnderwritingCase.application_id == application_id
    ).first()
    if not case:
        return None

    # Calculate risk score based on rules
    risk_score = _calculate_risk_score(data)

    assessment = models.Assessment(
        application_id=application_id,
        assessor_id=assessor_id,
        dti_ratio=data.dti_ratio,
        ltv_ratio=data.ltv_ratio,
        credit_score=data.credit_score,
        employment_years=data.employment_years,
        risk_score=risk_score,
        recommendation=data.recommendation,
        conditions=data.conditions,
        notes=data.notes,
    )
    db.add(assessment)

    # Update case
    case.status = "PENDING_DECISION"
    case.assigned_maker = assessor_id
    case.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(assessment)
    return assessment


def _calculate_risk_score(data: schemas.AssessmentCreate) -> float:
    """Calculate risk score based on underwriting rules."""
    score = 100.0

    # DTI rule: must be <= 40%
    if data.dti_ratio > 40:
        score -= 30
    elif data.dti_ratio > 30:
        score -= 10

    # LTV rule: must be <= 80%
    if data.ltv_ratio > 80:
        score -= 25
    elif data.ltv_ratio > 70:
        score -= 10

    # Employment: >= 2 years preferred
    if data.employment_years < 2:
        score -= 20
    elif data.employment_years < 3:
        score -= 5

    # Credit score bands
    if data.credit_score >= 750:
        score += 10
    elif data.credit_score >= 700:
        pass  # neutral
    elif data.credit_score >= 650:
        score -= 10
    else:
        score -= 25

    return max(score, 0)


def decide_application(
    db: Session, application_id: UUID, data: schemas.DecisionCreate, decision_maker_id: UUID
) -> models.Decision:
    case = db.query(models.UnderwritingCase).filter(
        models.UnderwritingCase.application_id == application_id
    ).first()
    if not case:
        return None

    # Enforce maker != checker
    if case.assigned_maker == decision_maker_id:
        raise ValueError("Maker and checker must be different users")

    decision = models.Decision(
        application_id=application_id,
        decision_maker_id=decision_maker_id,
        decision=data.decision,
        approved_amount=data.approved_amount,
        approved_rate=data.approved_rate,
        conditions=data.conditions,
        notes=data.notes,
    )
    db.add(decision)

    # Update case status
    if data.decision == "APPROVE":
        case.status = "APPROVED"
    elif data.decision == "REJECT":
        case.status = "REJECTED"
    else:
        case.status = "REFERRED_BACK"

    case.assigned_checker = decision_maker_id
    case.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(decision)
    return decision
