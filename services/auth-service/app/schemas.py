"""Pydantic schemas for Auth Service request/response models."""

import re
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


_PASSWORD_COMPLEXITY = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$"
)


# Request schemas
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str = Field(..., min_length=12, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = None
    role_name: Optional[str] = "CUSTOMER"

    @field_validator("password")
    @classmethod
    def _password_complexity(cls, value: str) -> str:
        if not _PASSWORD_COMPLEXITY.match(value):
            raise ValueError(
                "Password must be 12-128 chars and include lowercase, "
                "uppercase, number, and symbol."
            )
        return value


class UserLogin(BaseModel):
    username: str
    password: str


class TokenRefresh(BaseModel):
    refresh_token: str


class RoleUpdate(BaseModel):
    role_name: str


# Response schemas
class RoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    permissions: List[str]

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: UUID
    username: str
    email: str
    full_name: str
    phone: Optional[str]
    role: RoleResponse
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
