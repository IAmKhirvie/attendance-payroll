"""
Users API Endpoints
===================
User management (Admin only).
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.api.deps import get_db, get_current_admin, get_client_ip
from app.models.user import User, Role, UserStatus
from app.schemas.user import (
    UserCreate, UserUpdate, UserResponse, UserListResponse, ApproveUserRequest
)
from app.services.auth_service import AuthService
from app.services.audit_service import AuditService
from app.models.audit import AuditAction

router = APIRouter()


@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[UserStatus] = None,
    role_filter: Optional[Role] = None,
    search: Optional[str] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List all users (Admin only).
    """
    query = db.query(User)

    # Apply filters
    if status_filter:
        query = query.filter(User.status == status_filter)
    if role_filter:
        query = query.filter(User.role == role_filter)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.email.ilike(search_term)) |
            (User.first_name.ilike(search_term)) |
            (User.last_name.ilike(search_term))
        )

    # Get total count
    total = query.count()

    # Paginate
    users = query.order_by(User.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/pending", response_model=List[UserResponse])
async def list_pending_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List users pending approval (Admin only).
    """
    users = db.query(User).filter(User.status == UserStatus.PENDING).all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new user (Admin only).
    User is immediately active.
    """
    auth_service = AuthService(db)
    audit_service = AuditService(db)
    ip_address = get_client_ip(request)

    user, error = auth_service.create_user_by_hr(
        email=user_data.email,
        password=user_data.password,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role=user_data.role,
        employee_id=user_data.employee_id,
        must_change_password=user_data.must_change_password
    )

    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )

    # Log user creation
    audit_service.log_user_create(
        admin_user_id=current_admin.id,
        admin_email=current_admin.email,
        new_user={
            "id": user.id,
            "email": user.email,
            "role": user.role.value
        },
        ip_address=ip_address
    )

    return UserResponse.model_validate(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get user by ID (Admin only).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return UserResponse.model_validate(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update user (Admin only).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    audit_service = AuditService(db)
    ip_address = get_client_ip(request)
    old_value = {"email": user.email, "role": user.role.value, "status": user.status.value}

    # Update fields
    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    # Log update
    audit_service.log(
        action=AuditAction.USER_UPDATE,
        resource_type="user",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(user.id),
        old_value=old_value,
        new_value=update_data,
        ip_address=ip_address
    )

    return UserResponse.model_validate(user)


@router.post("/{user_id}/approve", response_model=UserResponse)
async def approve_user(
    user_id: int,
    approval_data: ApproveUserRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Approve a pending user registration (Admin only).
    """
    auth_service = AuthService(db)
    audit_service = AuditService(db)
    ip_address = get_client_ip(request)

    user, error = auth_service.approve_user(
        user_id=user_id,
        role=approval_data.role,
        employee_id=approval_data.employee_id
    )

    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )

    # Log approval
    audit_service.log(
        action=AuditAction.USER_APPROVE,
        resource_type="user",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(user.id),
        new_value={"status": user.status.value, "role": user.role.value},
        ip_address=ip_address
    )

    return UserResponse.model_validate(user)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: int,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Deactivate a user (Admin only).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent self-deactivation
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )

    audit_service = AuditService(db)
    ip_address = get_client_ip(request)

    old_status = user.status.value
    user.status = UserStatus.INACTIVE
    db.commit()
    db.refresh(user)

    # Log deactivation
    audit_service.log(
        action=AuditAction.USER_DEACTIVATE,
        resource_type="user",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(user.id),
        old_value={"status": old_status},
        new_value={"status": user.status.value},
        ip_address=ip_address
    )

    return UserResponse.model_validate(user)


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Reset user password to a temporary one (Admin only).
    """
    from app.core.security import hash_password
    import secrets

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Generate temporary password
    temp_password = secrets.token_urlsafe(8)
    user.password_hash = hash_password(temp_password)
    user.must_change_password = True
    user.failed_login_attempts = 0
    if user.status == UserStatus.LOCKED:
        user.status = UserStatus.ACTIVE
        user.locked_until = None

    db.commit()

    audit_service = AuditService(db)
    ip_address = get_client_ip(request)

    audit_service.log(
        action=AuditAction.PASSWORD_CHANGE,
        resource_type="user",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(user.id),
        ip_address=ip_address,
        metadata={"reset_by_admin": True}
    )

    return {
        "message": "Password reset successfully",
        "temporary_password": temp_password,
        "note": "User must change password on next login"
    }
