"""API routes for Notification Service."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from .database import get_db
from .schemas import (
    SendNotificationRequest, NotificationResponse,
    NotificationLogResponse, TemplateResponse,
)
from . import services

import sys
sys.path.insert(0, "/app")
from shared.middleware import get_current_user, TokenPayload

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.post("/send", response_model=NotificationResponse)
def send_notification(
    data: SendNotificationRequest,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.send_notification(db, data)


@router.get("", response_model=List[NotificationLogResponse])
def list_notifications(
    recipient_id: UUID = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.get_notifications(db, recipient_id, skip, limit)


@router.get("/templates", response_model=List[TemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    return services.get_templates(db)
