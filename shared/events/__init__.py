"""Shared event schemas for inter-service communication via Redis Pub/Sub."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
import json


@dataclass
class BaseEvent:
    event_type: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    service_name: str = ""
    payload: dict = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps({
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "service_name": self.service_name,
            "payload": self.payload,
        })

    @classmethod
    def from_json(cls, data: str) -> "BaseEvent":
        parsed = json.loads(data)
        return cls(**parsed)


# Event type constants
class EventTypes:
    # Auth events
    CUSTOMER_REGISTERED = "customer.registered"

    # KYC events
    KYC_SUBMITTED = "kyc.submitted"
    KYC_VERIFIED = "kyc.verified"

    # Loan events
    APPLICATION_SUBMITTED = "application.submitted"
    ELIGIBILITY_COMPLETED = "eligibility.completed"

    # Underwriting events
    ASSESSMENT_SUBMITTED = "assessment.submitted"
    DECISION_APPROVED = "decision.approved"
    DECISION_REJECTED = "decision.rejected"

    # Disbursement events
    LOAN_DISBURSED = "loan.disbursed"

    # Repayment events
    PAYMENT_RECEIVED = "payment.received"
    PAYMENT_OVERDUE = "payment.overdue"

    # Collections events
    COLLECTIONS_ESCALATED = "collections.escalated"


# Redis channel names
class Channels:
    AUTH = "auth.events"
    CUSTOMER = "customer.events"
    LOAN = "loan.events"
    UNDERWRITING = "underwriting.events"
    DISBURSEMENT = "disbursement.events"
    REPAYMENT = "repayment.events"
    COLLECTIONS = "collections.events"
    NOTIFICATION = "notification.events"
    AUDIT = "audit.events"
