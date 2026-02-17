"""
Settings API Endpoints
======================
System settings management (Admin only).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.api.deps import get_db, get_current_admin
from app.models.user import User
from app.models.settings import SystemSettings

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
