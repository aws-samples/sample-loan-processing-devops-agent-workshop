"""Seed data for Auth Service - demo user and roles.

This module is invoked from main.py ONLY when ENABLE_DEMO_SEED=true.

The sample uses **a single admin user** for simplicity. Every endpoint is
reachable through this account because it has the `admin:all` permission.
The full 5-role catalogue is still seeded so that a downstream consumer
adopting this sample can create additional users with the right role
without touching the schema.

The demo password below is a fixed, well-known value matching the
ClaimFlow / PaymentPro / Trading sample pattern. NEVER use this in any
production-like environment. The README and SECURITY.md document this
trade-off explicitly.

Idempotency:
  * Roles are inserted only when the table is empty.
  * The `admin` user is upserted by username, so the documented password
    is always the active one even after a redeploy that picks up a code
    change in this file.
"""

from __future__ import annotations

from typing import Dict, List

from .database import SessionLocal
from .models import Role, User
from .services import hash_password


ROLES = [
    {
        "id": 1,
        "name": "CUSTOMER",
        "description": "Loan applicant",
        "permissions": ["customer:read", "customer:write", "loan:apply", "loan:read", "payment:make"],
    },
    {
        "id": 2,
        "name": "LOAN_OFFICER",
        "description": "Reviews applications, KYC verification",
        "permissions": ["kyc:verify", "loan:review", "loan:read", "eligibility:run", "underwriting:maker"],
    },
    {
        "id": 3,
        "name": "UNDERWRITER",
        "description": "Approves/rejects loans",
        "permissions": ["underwriting:checker", "loan:read", "disbursement:process"],
    },
    {
        "id": 4,
        "name": "COLLECTIONS_AGENT",
        "description": "Manages overdue accounts",
        "permissions": ["collections:manage", "collections:read", "loan:read"],
    },
    {
        "id": 5,
        "name": "ADMIN",
        "description": "System administrator",
        "permissions": ["admin:all"],
    },
]


# Single fixed demo user. Workshop only. NEVER PRODUCTION.
DEMO_USERS: List[Dict[str, str]] = [
    {
        "username": "admin",
        "email": "admin@loanapp.example",
        "password": "Admin12345!",
        "full_name": "Demo Admin",
        "role_id": 5,
    },
]


def seed_data() -> None:
    """Seed roles and the single demo admin user idempotently.

    Roles are inserted only when the table is empty. The admin user is
    upserted by username so the documented password is always the active
    one.
    """
    db = SessionLocal()
    try:
        if db.query(Role).count() == 0:
            for role_data in ROLES:
                db.add(Role(**role_data))
            db.commit()

        # Upsert the single admin user.
        for spec in DEMO_USERS:
            existing = db.query(User).filter(User.username == spec["username"]).first()
            if existing is None:
                db.add(
                    User(
                        username=spec["username"],
                        email=spec["email"],
                        password_hash=hash_password(spec["password"]),
                        full_name=spec["full_name"],
                        role_id=spec["role_id"],
                    )
                )
            else:
                existing.password_hash = hash_password(spec["password"])
                existing.email = spec["email"]
                existing.full_name = spec["full_name"]
                existing.role_id = spec["role_id"]

        db.commit()

        print(
            "[auth-service:seed] Demo admin user seeded with the documented "
            "workshop credential. See README 'Sign in' section.",
            flush=True,
        )
    finally:
        db.close()
