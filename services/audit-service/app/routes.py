"""API routes for Audit Service."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from .database import get_db
from .schemas import AuditLogCreate, AuditLogResponse
from . import services

import sys
sys.path.insert(0, "/app")
from shared.middleware import get_current_user, TokenPayload

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


@router.post("/log", response_model=AuditLogResponse)
def create_audit_log(
    data: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.create_audit_log(db, data)


@router.get("/logs", response_model=List[AuditLogResponse])
def get_audit_logs(
    entity_type: Optional[str] = None,
    actor_id: Optional[UUID] = None,
    action: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.get_audit_logs(db, entity_type, actor_id, action, start_date, end_date, skip, limit)


@router.get("/logs/{entity_type}/{entity_id}", response_model=List[AuditLogResponse])
def get_entity_logs(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.get_entity_logs(db, entity_type, entity_id)
