"""
Settings API Endpoints
======================
System settings management (Admin only).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.api.deps import get_db, get_current_admin, get_current_user
from app.models.user import User
from app.models.settings import SystemSettings
from app.models.audit import AuditLog, AuditAction

router = APIRouter()


class PasswordPolicyUpdate(BaseModel):
    """Password policy settings."""
    password_min_length: Optional[int] = None
    password_require_uppercase: Optional[bool] = None
    password_require_numbers: Optional[bool] = None
    password_require_special: Optional[bool] = None
    password_expiry_days: Optional[int] = None
    max_failed_login_attempts: Optional[int] = None
    lockout_duration_minutes: Optional[int] = None


class RegistrationSettingsUpdate(BaseModel):
    """Self-registration settings."""
    allow_self_registration: Optional[bool] = None
    require_approval_for_registration: Optional[bool] = None


class CompanySettingsUpdate(BaseModel):
    """Company information settings."""
    company_name: Optional[str] = None
    company_address: Optional[str] = None


class SystemSettingsResponse(BaseModel):
    """Full system settings response."""
    company_name: str
    company_address: Optional[str]
    password_min_length: int
    password_require_uppercase: bool
    password_require_numbers: bool
    password_require_special: bool
    password_expiry_days: int
    max_failed_login_attempts: int
    lockout_duration_minutes: int
    allow_self_registration: bool
    require_approval_for_registration: bool
    default_shift_id: Optional[int]
    payroll_day_1: int
    payroll_day_2: int

    class Config:
        from_attributes = True


def get_or_create_settings(db: Session) -> SystemSettings:
    """Get or create system settings (singleton)."""
    settings = db.query(SystemSettings).first()
    if not settings:
        settings = SystemSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=SystemSettingsResponse)
async def get_settings(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all system settings (Admin only)."""
    settings = get_or_create_settings(db)
    return SystemSettingsResponse.model_validate(settings)


@router.patch("/password-policy")
async def update_password_policy(
    policy_data: PasswordPolicyUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update password policy settings (Admin only)."""
    settings = get_or_create_settings(db)

    update_data = policy_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)

    settings.updated_by = current_admin.id
    db.commit()

    return {"message": "Password policy updated"}


@router.patch("/registration")
async def update_registration_settings(
    reg_data: RegistrationSettingsUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update self-registration settings (Admin only)."""
    settings = get_or_create_settings(db)

    update_data = reg_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)

    settings.updated_by = current_admin.id
    db.commit()

    return {"message": "Registration settings updated"}


@router.patch("/company")
async def update_company_settings(
    company_data: CompanySettingsUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update company information (Admin only)."""
    settings = get_or_create_settings(db)

    update_data = company_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)

    settings.updated_by = current_admin.id
    db.commit()

    return {"message": "Company settings updated"}


class AuditLogResponse(BaseModel):
    """Audit log entry response."""
    id: int
    user_id: Optional[int]
    user_email: Optional[str]
    action: str
    details: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated audit log response."""
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get audit logs with pagination (Admin only)."""
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    total = query.count()
    items = query.order_by(desc(AuditLog.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    # Enrich with user email
    result_items = []
    for item in items:
        user_email = None
        if item.user_id:
            user = db.query(User).filter(User.id == item.user_id).first()
            if user:
                user_email = user.email

        result_items.append(AuditLogResponse(
            id=item.id,
            user_id=item.user_id,
            user_email=user_email,
            action=item.action.value if hasattr(item.action, 'value') else str(item.action),
            details=item.details,
            ip_address=item.ip_address,
            user_agent=item.user_agent,
            created_at=item.created_at
        ))

    return AuditLogListResponse(
        items=result_items,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/sessions")
async def get_active_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get login sessions (Admin only)."""
    # Get login events from audit log
    query = db.query(AuditLog).filter(
        AuditLog.action.in_([AuditAction.LOGIN, AuditAction.LOGOUT, AuditAction.LOGIN_FAILED])
    )

    total = query.count()
    items = query.order_by(desc(AuditLog.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    result_items = []
    for item in items:
        user_email = None
        if item.user_id:
            user = db.query(User).filter(User.id == item.user_id).first()
            if user:
                user_email = user.email

        result_items.append({
            "id": item.id,
            "user_id": item.user_id,
            "user_email": user_email,
            "action": item.action.value if hasattr(item.action, 'value') else str(item.action),
            "details": item.details,
            "ip_address": item.ip_address,
            "user_agent": item.user_agent,
            "created_at": item.created_at.isoformat() if item.created_at else None
        })

    return {
        "items": result_items,
        "total": total,
        "page": page,
        "page_size": page_size
    }
