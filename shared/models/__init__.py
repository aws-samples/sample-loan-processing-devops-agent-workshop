"""Shared models and enums used across all microservices."""

from enum import Enum


class UserRole(str, Enum):
    CUSTOMER = "CUSTOMER"
    LOAN_OFFICER = "LOAN_OFFICER"
    UNDERWRITER = "UNDERWRITER"
    COLLECTIONS_AGENT = "COLLECTIONS_AGENT"
    ADMIN = "ADMIN"


class KYCStatus(str, Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class LoanProductType(str, Enum):
    PERSONAL = "PERSONAL"
    HOME = "HOME"
    VEHICLE = "VEHICLE"


class LoanApplicationStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    DISBURSED = "DISBURSED"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


class EMIStatus(str, Enum):
    UPCOMING = "UPCOMING"
    DUE = "DUE"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    PARTIALLY_PAID = "PARTIALLY_PAID"


class CollectionsStage(str, Enum):
    REMINDER = "REMINDER"
    OVERDUE_NOTICE = "OVERDUE_NOTICE"
    LEGAL_NOTICE = "LEGAL_NOTICE"
    RESOLVED = "RESOLVED"


class UnderwritingRecommendation(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    REFER = "REFER"


class UnderwritingDecision(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    REFER_BACK = "REFER_BACK"


class PaymentMethod(str, Enum):
    UPI = "UPI"
    CARD = "CARD"
    BANK_TRANSFER = "BANK_TRANSFER"
    NACH = "NACH"


class EmploymentType(str, Enum):
    SALARIED = "SALARIED"
    SELF_EMPLOYED = "SELF_EMPLOYED"
    BUSINESS = "BUSINESS"
    RETIRED = "RETIRED"


class DocumentType(str, Enum):
    ID_PROOF = "ID_PROOF"
    ADDRESS_PROOF = "ADDRESS_PROOF"
    INCOME_PROOF = "INCOME_PROOF"


class AuditAction(str, Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    ACCESS = "ACCESS"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
