"""
Settings API Endpoints
======================
System settings management (Admin only).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import csv
import io
import json

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
    resource_type: Optional[str]
    resource_id: Optional[str]
    old_value: Optional[dict]
    new_value: Optional[dict]
    reason: Optional[str]
    extra_data: Optional[dict]
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
        # Convert string to enum for filtering
        try:
            action_enum = AuditAction(action.lower())
            query = query.filter(AuditLog.action == action_enum)
        except ValueError:
            # If action string doesn't match enum, try uppercase match
            try:
                action_enum = AuditAction[action.upper()]
                query = query.filter(AuditLog.action == action_enum)
            except KeyError:
                pass  # Invalid action filter, ignore
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    total = query.count()
    items = query.order_by(desc(AuditLog.timestamp)).offset((page - 1) * page_size).limit(page_size).all()

    # Enrich with user email
    result_items = []
    for item in items:
        user_email = item.user_email
        if not user_email and item.user_id:
            user = db.query(User).filter(User.id == item.user_id).first()
            if user:
                user_email = user.email

        result_items.append(AuditLogResponse(
            id=item.id,
            user_id=item.user_id,
            user_email=user_email,
            action=item.action.value if hasattr(item.action, 'value') else str(item.action),
            resource_type=item.resource_type,
            resource_id=item.resource_id,
            old_value=item.old_value,
            new_value=item.new_value,
            reason=item.reason,
            extra_data=item.extra_data,
            ip_address=item.ip_address,
            user_agent=item.user_agent,
            created_at=item.timestamp  # Use timestamp field from model
        ))

    return AuditLogListResponse(
        items=result_items,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/audit-logs/export")
async def export_audit_logs_csv(
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export audit logs as CSV (Admin only). Cannot be deleted - permanent audit trail."""
    query = db.query(AuditLog)

    if action:
        # Convert string to enum for filtering
        try:
            action_enum = AuditAction(action.lower())
            query = query.filter(AuditLog.action == action_enum)
        except ValueError:
            try:
                action_enum = AuditAction[action.upper()]
                query = query.filter(AuditLog.action == action_enum)
            except KeyError:
                pass  # Invalid action filter, ignore
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if start_date:
        query = query.filter(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.filter(AuditLog.timestamp <= end_date)

    items = query.order_by(desc(AuditLog.timestamp)).all()

    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        'ID', 'Timestamp', 'User ID', 'User Email', 'Action', 'Resource Type',
        'Resource ID', 'Old Value', 'New Value', 'Reason', 'IP Address',
        'User Agent', 'Extra Data'
    ])

    # Data rows
    for item in items:
        # Get user email
        user_email = item.user_email
        if not user_email and item.user_id:
            user = db.query(User).filter(User.id == item.user_id).first()
            if user:
                user_email = user.email

        writer.writerow([
            item.id,
            item.timestamp.strftime('%Y-%m-%d %H:%M:%S') if item.timestamp else '',
            item.user_id or '',
            user_email or 'System',
            item.action.value if hasattr(item.action, 'value') else str(item.action),
            item.resource_type or '',
            item.resource_id or '',
            json.dumps(item.old_value) if item.old_value else '',
            json.dumps(item.new_value) if item.new_value else '',
            item.reason or '',
            item.ip_address or '',
            item.user_agent or '',
            json.dumps(item.extra_data) if item.extra_data else ''
        ])

    # Prepare response
    output.seek(0)
    filename = f"audit_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8"
        }
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
    items = query.order_by(desc(AuditLog.timestamp)).offset((page - 1) * page_size).limit(page_size).all()

    result_items = []
    for item in items:
        user_email = item.user_email
        if not user_email and item.user_id:
            user = db.query(User).filter(User.id == item.user_id).first()
            if user:
                user_email = user.email

        result_items.append({
            "id": item.id,
            "user_id": item.user_id,
            "user_email": user_email,
            "action": item.action.value if hasattr(item.action, 'value') else str(item.action),
            "details": item.extra_data,
            "ip_address": item.ip_address,
            "user_agent": item.user_agent,
            "created_at": item.timestamp.isoformat() if item.timestamp else None
        })

    return {
        "items": result_items,
        "total": total,
        "page": page,
        "page_size": page_size
    }
