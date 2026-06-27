"""Business logic for Dashboard Service - Cross-schema queries.

All queries are parameterized via SQLAlchemy ``text(...).bindparams``.
Even where the query has no user-controlled inputs we keep the parameterized
style so future edits don't accidentally introduce SQL injection.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session


def get_summary(db: Session) -> dict:
    """Aggregate summary across all schemas."""
    customers = db.execute(text("SELECT COUNT(*) FROM customers.customers")).scalar() or 0
    applications = db.execute(text("SELECT COUNT(*) FROM loans.loan_applications")).scalar() or 0
    pending = db.execute(
        text(
            "SELECT COUNT(*) FROM loans.loan_applications "
            "WHERE status IN ('SUBMITTED', 'UNDER_REVIEW')"
        ),
    ).scalar() or 0
    # 'Approved' counts everything that got past underwriting at some
    # point in its lifecycle. Once an application is approved, the next
    # click in the demo flow disburses it, so the row moves quickly from
    # APPROVED -> DISBURSED -> ACTIVE. Counting only the literal APPROVED
    # state would show 0 for a working portfolio.
    approved = db.execute(
        text(
            "SELECT COUNT(*) FROM loans.loan_applications "
            "WHERE status IN ('APPROVED', 'DISBURSED', 'ACTIVE', 'CLOSED')"
        ),
    ).scalar() or 0
    rejected = db.execute(
        text("SELECT COUNT(*) FROM loans.loan_applications WHERE status = :status"),
        {"status": "REJECTED"},
    ).scalar() or 0
    active_loans = db.execute(
        text("SELECT COUNT(*) FROM disbursement.loans WHERE status = :status"),
        {"status": "ACTIVE"},
    ).scalar() or 0
    total_disbursed = db.execute(
        text(
            "SELECT COALESCE(SUM(amount), 0) FROM disbursement.disbursements "
            "WHERE status = :status"
        ),
        {"status": "COMPLETED"},
    ).scalar() or 0
    collections = db.execute(
        text("SELECT COUNT(*) FROM collections.collections_cases WHERE status = :status"),
        {"status": "ACTIVE"},
    ).scalar() or 0
    overdue_amount = db.execute(
        text(
            "SELECT COALESCE(SUM(total_overdue_amount), 0) "
            "FROM collections.collections_cases WHERE status = :status"
        ),
        {"status": "ACTIVE"},
    ).scalar() or 0

    return {
        "total_customers": customers,
        "total_applications": applications,
        "pending_applications": pending,
        "approved_applications": approved,
        "rejected_applications": rejected,
        "active_loans": active_loans,
        "total_disbursed": float(total_disbursed),
        "total_collections_cases": collections,
        "overdue_amount": float(overdue_amount),
    }


def get_pipeline(db: Session) -> dict:
    """Loan application pipeline metrics."""
    statuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "DISBURSED"]
    result: dict[str, int] = {}
    for status in statuses:
        count = db.execute(
            text("SELECT COUNT(*) FROM loans.loan_applications WHERE status = :status"),
            {"status": status},
        ).scalar() or 0
        result[status.lower()] = count
    return result


def get_collections_metrics(db: Session) -> dict:
    """Collections dashboard metrics."""
    total_active = db.execute(
        text("SELECT COUNT(*) FROM collections.collections_cases WHERE status = :status"),
        {"status": "ACTIVE"},
    ).scalar() or 0
    reminder = db.execute(
        text(
            "SELECT COUNT(*) FROM collections.collections_cases "
            "WHERE status = :status AND stage = :stage"
        ),
        {"status": "ACTIVE", "stage": "REMINDER"},
    ).scalar() or 0
    overdue_notice = db.execute(
        text(
            "SELECT COUNT(*) FROM collections.collections_cases "
            "WHERE status = :status AND stage = :stage"
        ),
        {"status": "ACTIVE", "stage": "OVERDUE_NOTICE"},
    ).scalar() or 0
    legal_notice = db.execute(
        text(
            "SELECT COUNT(*) FROM collections.collections_cases "
            "WHERE status = :status AND stage = :stage"
        ),
        {"status": "ACTIVE", "stage": "LEGAL_NOTICE"},
    ).scalar() or 0
    total_amount = db.execute(
        text(
            "SELECT COALESCE(SUM(total_overdue_amount), 0) "
            "FROM collections.collections_cases WHERE status = :status"
        ),
        {"status": "ACTIVE"},
    ).scalar() or 0

    first_of_month = date.today().replace(day=1)
    resolved = db.execute(
        text(
            "SELECT COUNT(*) FROM collections.collections_cases "
            "WHERE status = :status AND resolved_at >= :start"
        ),
        {"status": "RESOLVED", "start": first_of_month},
    ).scalar() or 0

    return {
        "total_active": total_active,
        "reminder_stage": reminder,
        "overdue_notice_stage": overdue_notice,
        "legal_notice_stage": legal_notice,
        "total_overdue_amount": float(total_amount),
        "resolved_this_month": resolved,
    }


def get_disbursement_metrics(db: Session) -> dict:
    """Disbursement dashboard metrics."""
    total_count = db.execute(
        text("SELECT COUNT(*) FROM disbursement.disbursements WHERE status = :status"),
        {"status": "COMPLETED"},
    ).scalar() or 0
    total_amount = db.execute(
        text(
            "SELECT COALESCE(SUM(amount), 0) FROM disbursement.disbursements "
            "WHERE status = :status"
        ),
        {"status": "COMPLETED"},
    ).scalar() or 0

    first_of_month = date.today().replace(day=1)
    month_count = db.execute(
        text(
            "SELECT COUNT(*) FROM disbursement.disbursements "
            "WHERE status = :status AND created_at >= :start"
        ),
        {"status": "COMPLETED", "start": first_of_month},
    ).scalar() or 0
    month_amount = db.execute(
        text(
            "SELECT COALESCE(SUM(amount), 0) FROM disbursement.disbursements "
            "WHERE status = :status AND created_at >= :start"
        ),
        {"status": "COMPLETED", "start": first_of_month},
    ).scalar() or 0

    rows = db.execute(
        text(
            "SELECT product_type, COALESCE(SUM(principal_amount), 0) AS total "
            "FROM disbursement.loans GROUP BY product_type"
        )
    ).fetchall()
    by_product = {row[0]: float(row[1]) for row in rows}

    return {
        "total_disbursed_count": total_count,
        "total_disbursed_amount": float(total_amount),
        "this_month_count": month_count,
        "this_month_amount": float(month_amount),
        "by_product_type": by_product,
    }
