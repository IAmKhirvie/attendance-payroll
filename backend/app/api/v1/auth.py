"""
Authentication API Endpoints
============================
Login, register, password management.
"""

from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_client_ip
from app.models.user import User
from app.schemas.user import (
    UserLogin, TokenResponse, RegisterRequest,
    ChangePasswordRequest, UserResponse
)
from app.services.auth_service import AuthService
from app.services.audit_service import AuditService
from app.models.audit import AuditAction
from app.core.security import get_password_strength

router = APIRouter()

# IP-based rate limiting for login attempts
# Stores: {ip_address: [(timestamp, was_success), ...]}
_login_attempts: dict[str, list[tuple[datetime, bool]]] = defaultdict(list)
_RATE_LIMIT_WINDOW = timedelta(minutes=15)  # Time window for rate limiting
_MAX_ATTEMPTS_PER_WINDOW = 10  # Max failed attempts per IP in window
_BLOCK_DURATION = timedelta(minutes=30)  # How long to block after exceeding limit


def _check_ip_rate_limit(ip_address: str) -> tuple[bool, str]:
    """
    Check if IP is rate limited.
    Returns (is_blocked, error_message).
    """
    now = datetime.utcnow()
    attempts = _login_attempts.get(ip_address, [])

    # Clean old attempts outside window
    cutoff = now - _RATE_LIMIT_WINDOW
    attempts = [(t, s) for t, s in attempts if t > cutoff]
    _login_attempts[ip_address] = attempts

    # Count recent failed attempts
    failed_attempts = sum(1 for t, s in attempts if not s)

    if failed_attempts >= _MAX_ATTEMPTS_PER_WINDOW:
        # Check if block duration has passed since last attempt
        if attempts:
            last_attempt = max(t for t, _ in attempts)
            if now - last_attempt < _BLOCK_DURATION:
                remaining = _BLOCK_DURATION - (now - last_attempt)
                mins = int(remaining.total_seconds() / 60) + 1
                return True, f"Too many failed login attempts. Please try again in {mins} minutes."

    return False, ""


def _record_login_attempt(ip_address: str, success: bool):
    """Record a login attempt for rate limiting."""
    _login_attempts[ip_address].append((datetime.utcnow(), success))


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: UserLogin,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Authenticate user and return JWT tokens.
    """
    auth_service = AuthService(db)
    audit_service = AuditService(db)
    ip_address = get_client_ip(request)

    # Check IP-based rate limiting
    is_blocked, block_error = _check_ip_rate_limit(ip_address)
    if is_blocked:
        audit_service.log(
            action=AuditAction.LOGIN_FAILED,
            resource_type="user",
            user_email=login_data.email,
            ip_address=ip_address,
            user_agent=request.headers.get("User-Agent"),
            extra_data={"error": "IP rate limited"}
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=block_error
        )

    user, error = auth_service.authenticate(login_data.email, login_data.password)

    if error:
        # Record failed attempt for rate limiting
        _record_login_attempt(ip_address, success=False)

        # Log failed attempt
        audit_service.log(
            action=AuditAction.LOGIN_FAILED,
            resource_type="user",
            user_email=login_data.email,
            ip_address=ip_address,
            user_agent=request.headers.get("User-Agent"),
            extra_data={"error": error}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error
        )

    # Record successful login
    _record_login_attempt(ip_address, success=True)

    # Create tokens
    tokens = auth_service.create_tokens(user)

    # Log successful login
    audit_service.log_login(
        user_id=user.id,
        user_email=user.email,
        success=True,
        ip_address=ip_address,
        user_agent=request.headers.get("User-Agent")
    )

    return TokenResponse(
        **tokens,
        user=UserResponse.model_validate(user)
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    register_data: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Self-register a new user account.
    Account will be in PENDING status until HR approval.
    """
    auth_service = AuthService(db)
    audit_service = AuditService(db)
    ip_address = get_client_ip(request)

    user, error = auth_service.register_user(
        email=register_data.email,
        password=register_data.password,
        first_name=register_data.first_name,
        last_name=register_data.last_name,
        employee_no=register_data.employee_no
    )

    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )

    # Log registration
    audit_service.log(
        action=AuditAction.USER_CREATE,
        resource_type="user",
        user_email=user.email,
        resource_id=str(user.id),
        new_value={"email": user.email, "status": user.status.value},
        ip_address=ip_address,
        extra_data={"registration_type": "self"}
    )

    return UserResponse.model_validate(user)


@router.post("/change-password")
async def change_password(
    password_data: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change current user's password.
    """
    auth_service = AuthService(db)
    audit_service = AuditService(db)
    ip_address = get_client_ip(request)

    success, error = auth_service.change_password(
        user=current_user,
        current_password=password_data.current_password,
        new_password=password_data.new_password
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )

    # Log password change
    audit_service.log(
        action=AuditAction.PASSWORD_CHANGE,
        resource_type="user",
        user_id=current_user.id,
        user_email=current_user.email,
        resource_id=str(current_user.id),
        ip_address=ip_address
    )

    return {"message": "Password changed successfully"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    Get current authenticated user's information.
    """
    return UserResponse.model_validate(current_user)


@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Logout current user.
    Note: JWT tokens are stateless, so this mainly logs the action.
    Client should discard the token.
    """
    audit_service = AuditService(db)
    ip_address = get_client_ip(request)

    audit_service.log_logout(
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=ip_address
    )

    return {"message": "Logged out successfully"}


@router.get("/password-policy")
async def get_password_policy(db: Session = Depends(get_db)):
    """
    Get current password policy (public endpoint).
    Used by frontend for validation hints.
    """
    auth_service = AuthService(db)
    return auth_service.get_password_policy()


@router.post("/check-password-strength")
async def check_password_strength(password: str):
    """
    Check password strength (public endpoint).
    Used by frontend for real-time password strength feedback.
    """
    return get_password_strength(password)
