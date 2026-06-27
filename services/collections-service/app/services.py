"""Business logic for Collections Service."""

from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func
from . import models, schemas


# Stage escalation thresholds (days overdue)
STAGE_THRESHOLDS = {
    "REMINDER": 3,
    "OVERDUE_NOTICE": 7,
    "LEGAL_NOTICE": 15,
}


def get_cases(db: Session, status: str = None, stage: str = None):
    query = db.query(models.CollectionsCase)
    if status:
        query = query.filter(models.CollectionsCase.status == status)
    if stage:
        query = query.filter(models.CollectionsCase.stage == stage)
    return query.order_by(models.CollectionsCase.days_overdue.desc()).all()


def get_or_create_case(db: Session, loan_id: UUID, customer_id: UUID, days_overdue: int, amount: float):
    case = db.query(models.CollectionsCase).filter(
        models.CollectionsCase.loan_id == loan_id,
        models.CollectionsCase.status == "ACTIVE"
    ).first()

    if not case:
        # Determine stage based on days overdue
        stage = "REMINDER"
        if days_overdue >= STAGE_THRESHOLDS["LEGAL_NOTICE"]:
            stage = "LEGAL_NOTICE"
        elif days_overdue >= STAGE_THRESHOLDS["OVERDUE_NOTICE"]:
            stage = "OVERDUE_NOTICE"

        case = models.CollectionsCase(
            loan_id=loan_id,
            customer_id=customer_id,
            stage=stage,
            days_overdue=days_overdue,
            total_overdue_amount=amount,
        )
        db.add(case)
        db.commit()
        db.refresh(case)
    else:
        case.days_overdue = days_overdue
        case.total_overdue_amount = amount
        db.commit()
        db.refresh(case)

    return case


def escalate_case(db: Session, loan_id: UUID, agent_id: UUID):
    case = db.query(models.CollectionsCase).filter(
        models.CollectionsCase.loan_id == loan_id,
        models.CollectionsCase.status == "ACTIVE"
    ).first()

    if not case:
        return None

    # Escalate to next stage
    if case.stage == "REMINDER":
        case.stage = "OVERDUE_NOTICE"
    elif case.stage == "OVERDUE_NOTICE":
        case.stage = "LEGAL_NOTICE"

    case.escalated_at = datetime.utcnow()
    case.assigned_agent_id = agent_id
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


def add_action(db: Session, loan_id: UUID, data: schemas.ActionCreate, agent_id: UUID):
    case = db.query(models.CollectionsCase).filter(
        models.CollectionsCase.loan_id == loan_id,
        models.CollectionsCase.status == "ACTIVE"
    ).first()

    if not case:
        return None

    action = models.CollectionsAction(
        case_id=case.id,
        loan_id=loan_id,
        action_type=data.action_type,
        notes=data.notes,
        performed_by=agent_id,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


def get_summary(db: Session) -> dict:
    total = db.query(func.count(models.CollectionsCase.id)).scalar() or 0
    active = db.query(func.count(models.CollectionsCase.id)).filter(
        models.CollectionsCase.status == "ACTIVE"
    ).scalar() or 0
    reminder = db.query(func.count(models.CollectionsCase.id)).filter(
        models.CollectionsCase.stage == "REMINDER", models.CollectionsCase.status == "ACTIVE"
    ).scalar() or 0
    overdue_notice = db.query(func.count(models.CollectionsCase.id)).filter(
        models.CollectionsCase.stage == "OVERDUE_NOTICE", models.CollectionsCase.status == "ACTIVE"
    ).scalar() or 0
    legal_notice = db.query(func.count(models.CollectionsCase.id)).filter(
        models.CollectionsCase.stage == "LEGAL_NOTICE", models.CollectionsCase.status == "ACTIVE"
    ).scalar() or 0
    resolved = db.query(func.count(models.CollectionsCase.id)).filter(
        models.CollectionsCase.status == "RESOLVED"
    ).scalar() or 0
    total_amount = db.query(func.sum(models.CollectionsCase.total_overdue_amount)).filter(
        models.CollectionsCase.status == "ACTIVE"
    ).scalar() or 0

    return {
        "total_cases": total,
        "active_cases": active,
        "reminder_stage": reminder,
        "overdue_notice_stage": overdue_notice,
        "legal_notice_stage": legal_notice,
        "resolved": resolved,
        "total_overdue_amount": total_amount,
    }
