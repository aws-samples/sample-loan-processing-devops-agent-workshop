"""Business logic for Repayment Service."""

import uuid
import random
from datetime import datetime, date, timedelta
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import text
from . import models, schemas


GRACE_PERIOD_DAYS = 3
PENALTY_RATE_PER_MONTH = 2.0  # 2% per month


def get_schedule(db: Session, loan_id: UUID):
    """Get EMI schedule from disbursement schema."""
    result = db.execute(
        text("SELECT * FROM disbursement.emi_schedule WHERE loan_id = :lid ORDER BY installment_number"),
        {"lid": str(loan_id)}
    )
    return [dict(row._mapping) for row in result]


def make_payment(db: Session, loan_id: UUID, customer_id: UUID, data: schemas.PaymentCreate):
    """Process an EMI payment.

    On success this:
      1. Inserts a SUCCESS Payment row.
      2. Marks the matching disbursement.emi_schedule row as PAID.
      3. Subtracts that installment's principal_component from
         disbursement.loans.outstanding_principal so the dashboard tile
         and Active Loans table reflect the new balance.
      4. Advances disbursement.loans.next_emi_date to the next UPCOMING
         installment, or marks the loan CLOSED when none remain.
    """
    ref = f"PAY-{uuid.uuid4().hex[:8].upper()}"
    payment = models.Payment(
        loan_id=loan_id,
        customer_id=customer_id,
        installment_number=data.installment_number,
        amount=data.amount,
        payment_method=data.payment_method,
        payment_type="EMI",
        reference_number=ref,
        status="SUCCESS",
    )
    db.add(payment)

    # Update EMI schedule status in disbursement schema and adjust the
    # loan's outstanding principal + next due date.
    if data.installment_number:
        # Look up the installment to know how much principal it carries.
        # We only adjust the loan if the row was actually moved to PAID
        # (UPDATE ... RETURNING tells us whether anything changed).
        row = db.execute(
            text(
                """UPDATE disbursement.emi_schedule
                       SET status = 'PAID', paid_date = :pd
                     WHERE loan_id = :lid
                       AND installment_number = :num
                       AND status <> 'PAID'
                 RETURNING principal_component"""
            ),
            {"pd": date.today(), "lid": str(loan_id), "num": data.installment_number},
        ).first()

        if row is not None:
            principal_paid = float(row[0] or 0)

            # Find the next still-unpaid installment to advance the loan's
            # next_emi_date pointer.
            next_due = db.execute(
                text(
                    """SELECT due_date
                         FROM disbursement.emi_schedule
                        WHERE loan_id = :lid AND status <> 'PAID'
                        ORDER BY installment_number ASC
                        LIMIT 1"""
                ),
                {"lid": str(loan_id)},
            ).first()

            if next_due is not None:
                db.execute(
                    text(
                        """UPDATE disbursement.loans
                              SET outstanding_principal = GREATEST(
                                    outstanding_principal - :amt, 0
                                  ),
                                  next_emi_date = :next_date
                            WHERE id = :lid"""
                    ),
                    {"amt": principal_paid, "next_date": next_due[0], "lid": str(loan_id)},
                )
            else:
                # Final installment paid — close the loan.
                db.execute(
                    text(
                        """UPDATE disbursement.loans
                              SET outstanding_principal = 0,
                                  next_emi_date = NULL,
                                  status = 'CLOSED'
                            WHERE id = :lid"""
                    ),
                    {"lid": str(loan_id)},
                )

    db.commit()
    db.refresh(payment)
    return payment


def process_auto_debit(db: Session, loan_id: UUID, customer_id: UUID, data: schemas.AutoDebitSetup):
    """Simulate auto-debit with 90% success rate."""
    # Get next due EMI
    schedule = get_schedule(db, loan_id)
    next_due = None
    for item in schedule:
        if item["status"] in ("UPCOMING", "DUE"):
            next_due = item
            break

    if not next_due:
        return {"status": "NO_PENDING_EMI", "message": "No pending EMI found"}

    # Simulate 90% success rate
    success = random.random() < 0.9  # nosec B311 — simulated auto-debit outcome for demo, not security-relevant
    ref = f"AD-{uuid.uuid4().hex[:8].upper()}"

    payment = models.Payment(
        loan_id=loan_id,
        customer_id=customer_id,
        installment_number=next_due["installment_number"],
        amount=float(next_due["emi_amount"]),
        payment_method="NACH",
        payment_type="EMI",
        reference_number=ref,
        status="SUCCESS" if success else "FAILED",
    )
    db.add(payment)

    if success:
        # Mark the installment paid and adjust the loan's outstanding
        # principal and next_emi_date the same way make_payment does.
        row = db.execute(
            text(
                """UPDATE disbursement.emi_schedule
                       SET status = 'PAID', paid_date = :pd
                     WHERE loan_id = :lid
                       AND installment_number = :num
                       AND status <> 'PAID'
                 RETURNING principal_component"""
            ),
            {"pd": date.today(), "lid": str(loan_id), "num": next_due["installment_number"]},
        ).first()

        if row is not None:
            principal_paid = float(row[0] or 0)
            next_unpaid = db.execute(
                text(
                    """SELECT due_date
                         FROM disbursement.emi_schedule
                        WHERE loan_id = :lid AND status <> 'PAID'
                        ORDER BY installment_number ASC
                        LIMIT 1"""
                ),
                {"lid": str(loan_id)},
            ).first()
            if next_unpaid is not None:
                db.execute(
                    text(
                        """UPDATE disbursement.loans
                              SET outstanding_principal = GREATEST(
                                    outstanding_principal - :amt, 0
                                  ),
                                  next_emi_date = :next_date
                            WHERE id = :lid"""
                    ),
                    {"amt": principal_paid, "next_date": next_unpaid[0], "lid": str(loan_id)},
                )
            else:
                db.execute(
                    text(
                        """UPDATE disbursement.loans
                              SET outstanding_principal = 0,
                                  next_emi_date = NULL,
                                  status = 'CLOSED'
                            WHERE id = :lid"""
                    ),
                    {"lid": str(loan_id)},
                )

    db.commit()
    db.refresh(payment)
    return {
        "status": "SUCCESS" if success else "FAILED",
        "payment_id": str(payment.id),
        "reference_number": ref,
        "amount": float(next_due["emi_amount"]),
        "installment_number": next_due["installment_number"],
    }


def make_prepayment(db: Session, loan_id: UUID, customer_id: UUID, data: schemas.PrepaymentCreate):
    """Process a prepayment."""
    ref = f"PRE-{uuid.uuid4().hex[:8].upper()}"
    payment = models.Payment(
        loan_id=loan_id,
        customer_id=customer_id,
        amount=data.amount,
        payment_method=data.payment_method,
        payment_type="PREPAYMENT",
        reference_number=ref,
        status="SUCCESS",
    )
    db.add(payment)

    # Reduce outstanding principal
    db.execute(
        text("""UPDATE disbursement.loans 
                SET outstanding_principal = outstanding_principal - :amt 
                WHERE id = :lid"""),
        {"amt": data.amount, "lid": str(loan_id)}
    )

    db.commit()
    db.refresh(payment)
    return payment


def get_overdue(db: Session):
    """Get all overdue EMIs across all loans."""
    today = date.today()
    grace_date = today - timedelta(days=GRACE_PERIOD_DAYS)

    result = db.execute(
        text("""SELECT loan_id, installment_number, due_date, emi_amount 
                FROM disbursement.emi_schedule 
                WHERE status IN ('UPCOMING', 'DUE') AND due_date < :grace_date
                ORDER BY due_date"""),
        {"grace_date": grace_date}
    )

    overdue_items = []
    for row in result:
        r = row._mapping
        days_overdue = (today - r["due_date"]).days
        # Penalty: 2% per month after grace period
        months_overdue = max(1, (days_overdue - GRACE_PERIOD_DAYS) // 30 + 1)
        penalty = round(float(r["emi_amount"]) * (PENALTY_RATE_PER_MONTH / 100) * months_overdue, 2)

        overdue_items.append({
            "loan_id": str(r["loan_id"]),
            "installment_number": r["installment_number"],
            "due_date": str(r["due_date"]),
            "emi_amount": float(r["emi_amount"]),
            "days_overdue": days_overdue,
            "penalty_amount": penalty,
        })

    return overdue_items
