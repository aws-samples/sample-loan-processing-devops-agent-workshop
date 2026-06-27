"""Business logic for Notification Service."""

from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session
from . import models, schemas


def send_notification(db: Session, data: schemas.SendNotificationRequest) -> models.NotificationLog:
    """Simulate sending a notification (log to DB)."""
    subject = data.subject or ""
    body = data.body or ""

    # If template specified, use it
    if data.template_name:
        template = db.query(models.EmailTemplate).filter(
            models.EmailTemplate.name == data.template_name,
            models.EmailTemplate.is_active == True,  # noqa: E712  # nosemgrep: is-function-without-parentheses
        ).first()
        if template:
            subject = template.subject
            body = template.body

    log = models.NotificationLog(
        recipient_email=data.recipient_email,
        recipient_id=data.recipient_id,
        template_name=data.template_name,
        subject=subject,
        body=body,
        status="DELIVERED",  # Simulated delivery
        metadata=data.metadata or {},
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_notifications(db: Session, recipient_id: UUID = None, skip: int = 0, limit: int = 50):
    query = db.query(models.NotificationLog)
    if recipient_id:
        query = query.filter(models.NotificationLog.recipient_id == recipient_id)
    return query.order_by(models.NotificationLog.sent_at.desc()).offset(skip).limit(limit).all()


def get_templates(db: Session):
    return db.query(models.EmailTemplate).filter(models.EmailTemplate.is_active == True).all()  # noqa: E712  # nosemgrep: is-function-without-parentheses


def seed_templates(db: Session):
    """Seed 12 email templates."""
    existing = db.query(models.EmailTemplate).count()
    if existing > 0:
        return

    templates = [
        ("welcome", "Welcome to LoanPro", "Dear {{name}}, Welcome to LoanPro! Your account has been created.", "customer.registered"),
        ("kyc_submitted", "KYC Documents Received", "Dear {{name}}, We have received your KYC documents. Verification is in progress.", "kyc.submitted"),
        ("kyc_verified", "KYC Verification Complete", "Dear {{name}}, Your KYC has been verified successfully.", "kyc.verified"),
        ("application_received", "Loan Application Received", "Dear {{name}}, Your loan application #{{app_id}} has been received.", "application.submitted"),
        ("application_approved", "Loan Application Approved", "Dear {{name}}, Congratulations! Your loan application has been approved.", "decision.approved"),
        ("application_rejected", "Loan Application Update", "Dear {{name}}, We regret to inform you that your loan application was not approved.", "decision.rejected"),
        ("loan_disbursed", "Loan Disbursed", "Dear {{name}}, Your loan of {{amount}} has been disbursed to your account.", "loan.disbursed"),
        ("emi_reminder", "EMI Due Reminder", "Dear {{name}}, Your EMI of {{amount}} is due on {{date}}.", "payment.reminder"),
        ("emi_received", "Payment Received", "Dear {{name}}, We have received your EMI payment of {{amount}}.", "payment.received"),
        ("payment_overdue", "Payment Overdue Notice", "Dear {{name}}, Your EMI payment is overdue. Please pay immediately to avoid penalties.", "payment.overdue"),
        ("collections_reminder", "Collections Reminder", "Dear {{name}}, This is a reminder regarding your overdue payment.", "collections.escalated"),
        ("legal_notice", "Legal Notice", "Dear {{name}}, This is a formal notice regarding your overdue loan account.", "collections.legal"),
    ]

    for name, subject, body, event_type in templates:
        template = models.EmailTemplate(
            name=name, subject=subject, body=body, event_type=event_type
        )
        db.add(template)

    db.commit()
