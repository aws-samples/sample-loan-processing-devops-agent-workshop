"""SQLAlchemy models for Audit Service."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


class AuditEntry(Base):
    __tablename__ = "audit_entries"
    __table_args__ = {"schema": "audit"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String(100), nullable=False, index=True)
    entity_id = Column(String(100), nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)
    actor_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    actor_name = Column(String(100))
    service_name = Column(String(100))
    details = Column(JSON, default=dict)
    old_values = Column(JSON)
    new_values = Column(JSON)
    ip_address = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
