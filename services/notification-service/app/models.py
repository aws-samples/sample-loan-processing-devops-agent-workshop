"""SQLAlchemy models for Notification Service."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, JSON
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


class EmailTemplate(Base):
    __tablename__ = "email_templates"
    __table_args__ = {"schema": "notifications"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(String(5000), nullable=False)
    event_type = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    __table_args__ = {"schema": "notifications"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient_email = Column(String(255), nullable=False)
    recipient_id = Column(UUID(as_uuid=True))
    template_name = Column(String(100))
    subject = Column(String(500), nullable=False)
    body = Column(String(5000), nullable=False)
    channel = Column(String(20), default="EMAIL")
    status = Column(String(20), default="SENT")
    extra_data = Column(JSON, default=dict)
    sent_at = Column(DateTime, default=datetime.utcnow, nullable=False)
