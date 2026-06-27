"""Business logic for Audit Service."""

from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session
from . import models, schemas


def create_audit_log(db: Session, data: schemas.AuditLogCreate) -> models.AuditEntry:
    """Append-only audit entry creation."""
    entry = models.AuditEntry(
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        action=data.action,
        actor_id=data.actor_id,
        actor_name=data.actor_name,
        service_name=data.service_name,
        details=data.details or {},
        old_values=data.old_values,
        new_values=data.new_values,
        ip_address=data.ip_address,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_audit_logs(
    db: Session,
    entity_type: str = None,
    actor_id: UUID = None,
    action: str = None,
    start_date: datetime = None,
    end_date: datetime = None,
    skip: int = 0,
    limit: int = 50,
):
    """Get audit logs with filters."""
    query = db.query(models.AuditEntry)

    if entity_type:
        query = query.filter(models.AuditEntry.entity_type == entity_type)
    if actor_id:
        query = query.filter(models.AuditEntry.actor_id == actor_id)
    if action:
        query = query.filter(models.AuditEntry.action == action)
    if start_date:
        query = query.filter(models.AuditEntry.created_at >= start_date)
    if end_date:
        query = query.filter(models.AuditEntry.created_at <= end_date)

    return query.order_by(models.AuditEntry.created_at.desc()).offset(skip).limit(limit).all()


def get_entity_logs(db: Session, entity_type: str, entity_id: str):
    """Get all audit logs for a specific entity."""
    return db.query(models.AuditEntry).filter(
        models.AuditEntry.entity_type == entity_type,
        models.AuditEntry.entity_id == entity_id,
    ).order_by(models.AuditEntry.created_at.desc()).all()
