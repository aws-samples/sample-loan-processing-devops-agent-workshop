"""Pydantic schemas for Notification Service."""

from pydantic import BaseModel
from typing import Optional, Dict, List
from uuid import UUID
from datetime import datetime


class SendNotificationRequest(BaseModel):
    recipient_email: str
    recipient_id: Optional[UUID] = None
    template_name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    metadata: Optional[Dict] = {}


class NotificationResponse(BaseModel):
    id: UUID
    recipient_email: str
    subject: str
    status: str
    sent_at: datetime

    class Config:
        from_attributes = True


class NotificationLogResponse(BaseModel):
    id: UUID
    recipient_email: str
    recipient_id: Optional[UUID]
    template_name: Optional[str]
    subject: str
    body: str
    channel: str
    status: str
    sent_at: datetime

    class Config:
        from_attributes = True


class TemplateResponse(BaseModel):
    id: UUID
    name: str
    subject: str
    body: str
    event_type: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True
