"""
Authentication API Endpoints
============================
Login, register, password management.
"""

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

    user, error = auth_service.authenticate(login_data.email, login_data.password)

    if error:
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
