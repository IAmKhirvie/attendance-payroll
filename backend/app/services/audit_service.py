"""
Audit Service
=============
Service for logging all auditable actions.
"""

from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.audit import AuditLog, AuditAction


class AuditService:
    """Audit logging service."""

    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        action: AuditAction,
        resource_type: str,
        user_id: Optional[int] = None,
        user_email: Optional[str] = None,
        resource_id: Optional[str] = None,
        old_value: Optional[dict] = None,
        new_value: Optional[dict] = None,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> AuditLog:
        """
        Log an auditable action.
        Returns the created audit log entry.
        """
        log_entry = AuditLog(
            user_id=user_id,
            user_email=user_email,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            old_value=old_value,
            new_value=new_value,
            reason=reason,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata
        )
        self.db.add(log_entry)
        self.db.commit()
        self.db.refresh(log_entry)
        return log_entry

    def log_login(
        self,
        user_id: int,
        user_email: str,
        success: bool,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Log a login attempt."""
        action = AuditAction.LOGIN if success else AuditAction.LOGIN_FAILED
        return self.log(
            action=action,
            resource_type="user",
            user_id=user_id if success else None,
            user_email=user_email,
            resource_id=str(user_id) if success else None,
            ip_address=ip_address,
            user_agent=user_agent
        )

    def log_logout(
        self,
        user_id: int,
        user_email: str,
        ip_address: Optional[str] = None
    ):
        """Log a logout."""
        return self.log(
            action=AuditAction.LOGOUT,
            resource_type="user",
            user_id=user_id,
            user_email=user_email,
            resource_id=str(user_id),
            ip_address=ip_address
        )

    def log_user_create(
        self,
        admin_user_id: int,
        admin_email: str,
        new_user: dict,
        ip_address: Optional[str] = None
    ):
        """Log user creation."""
        return self.log(
            action=AuditAction.USER_CREATE,
            resource_type="user",
            user_id=admin_user_id,
            user_email=admin_email,
            resource_id=str(new_user.get("id")),
            new_value=new_user,
            ip_address=ip_address
        )

    def log_attendance_edit(
        self,
        user_id: int,
        user_email: str,
        attendance_id: int,
        old_value: dict,
        new_value: dict,
        reason: str,
        ip_address: Optional[str] = None
    ):
        """Log attendance edit."""
        return self.log(
            action=AuditAction.ATTENDANCE_EDIT,
            resource_type="attendance",
            user_id=user_id,
            user_email=user_email,
            resource_id=str(attendance_id),
            old_value=old_value,
            new_value=new_value,
            reason=reason,
            ip_address=ip_address
        )

    def log_payroll_run(
        self,
        user_id: int,
        user_email: str,
        payroll_run_id: int,
        payroll_data: dict,
        ip_address: Optional[str] = None
    ):
        """Log payroll run."""
        return self.log(
            action=AuditAction.PAYROLL_RUN,
            resource_type="payroll",
            user_id=user_id,
            user_email=user_email,
            resource_id=str(payroll_run_id),
            new_value=payroll_data,
            ip_address=ip_address
        )
