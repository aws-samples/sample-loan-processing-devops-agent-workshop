"""API routes for Auth Service."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from middleware import (  # type: ignore  # shared JWT middleware
    TokenPayload,
    get_current_user,
    require_role,
)

from .config import settings
from .database import get_db
from .schemas import (
    MessageResponse,
    RoleUpdate,
    TokenRefresh,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from .services import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    deactivate_user,
    get_all_users,
    get_user_by_id,
    refresh_user_token,
    register_user,
    update_user_role,
)


limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/v1")


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    try:
        return register_user(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit(settings.login_rate_limit)
def login(request: Request, data: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return tokens."""
    user = authenticate_user(db, data.username, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    access_token = create_access_token(user)
    refresh_token = create_refresh_token(db, user)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=user,
    )


@router.post("/auth/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh(request: Request, data: TokenRefresh, db: Session = Depends(get_db)):
    """Refresh access token using refresh token."""
    user = refresh_user_token(db, data.refresh_token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    access_token = create_access_token(user)
    new_refresh_token = create_refresh_token(db, user)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=user,
    )


@router.get("/auth/me", response_model=UserResponse)
def get_me(
    current_user: TokenPayload = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current user profile."""
    user = get_user_by_id(db, UUID(current_user.sub))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# Admin endpoints
@router.get("/users", response_model=List[UserResponse])
def list_users(
    skip: int = 0,
    limit: int = 50,
    current_user: TokenPayload = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """List all users (admin only)."""
    return get_all_users(db, skip=skip, limit=limit)


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    current_user: TokenPayload = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Create a new user with any role (admin only)."""
    try:
        return register_user(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.put("/users/{user_id}/role", response_model=UserResponse)
def change_role(
    user_id: UUID,
    data: RoleUpdate,
    current_user: TokenPayload = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Update user role (admin only)."""
    try:
        user = update_user_role(db, user_id, data.role_name)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: UUID,
    current_user: TokenPayload = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Deactivate a user (admin only)."""
    if str(user_id) == current_user.sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )
    user = deactivate_user(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return MessageResponse(message=f"User '{user.username}' deactivated")


# Wire the limiter into the router-level exception handling.
def _handle_rate_limit(request: Request, exc: RateLimitExceeded):
    """Return 429 response when rate limit is exceeded."""
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Try again later."},
    )


def install_rate_limiter(app) -> None:
    """Attach the limiter to the FastAPI app. Called from main.py."""
    app.state.limiter = limiter
    app.exception_handler(RateLimitExceeded)(_handle_rate_limit)
