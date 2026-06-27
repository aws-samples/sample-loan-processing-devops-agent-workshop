"""Pydantic schemas for Audit Service."""

from pydantic import BaseModel
from typing import Optional, Dict, List
from uuid import UUID
from datetime import datetime


class AuditLogCreate(BaseModel):
    entity_type: str
    entity_id: str
    action: str
    actor_id: UUID
    actor_name: Optional[str] = None
    service_name: Optional[str] = None
    details: Optional[Dict] = {}
    old_values: Optional[Dict] = None
    new_values: Optional[Dict] = None
    ip_address: Optional[str] = None


class AuditLogResponse(BaseModel):
    id: UUID
    entity_type: str
    entity_id: str
    action: str
    actor_id: UUID
    actor_name: Optional[str]
    service_name: Optional[str]
    details: Dict
    old_values: Optional[Dict]
    new_values: Optional[Dict]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
