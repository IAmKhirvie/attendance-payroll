"""
Audit Service
=============
Service for logging all auditable actions.
"""

import logging
from typing import Optional, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timedelta
from app.models.audit import AuditLog, AuditAction

logger = logging.getLogger(__name__)


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
        extra_data: Optional[dict] = None
    ) -> AuditLog:
        """
        Log an auditable action.
        Returns the created audit log entry.
        """
        try:
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
                extra_data=extra_data
            )
            self.db.add(log_entry)
            self.db.commit()
            self.db.refresh(log_entry)
            return log_entry
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")
            self.db.rollback()
            raise

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

    # ==================== Payslip ====================

    def log_payslip_release(
        self,
        user_id: int,
        user_email: str,
        payslip_ids: List[int],
        count: int,
        ip_address: Optional[str] = None
    ):
        """Log payslip release."""
        action = AuditAction.PAYSLIP_BULK_RELEASE if count > 1 else AuditAction.PAYSLIP_RELEASE
        return self.log(
            action=action,
            resource_type="payslip",
            user_id=user_id,
            user_email=user_email,
            extra_data={
                "payslip_ids": payslip_ids[:20],  # Limit stored IDs
                "total_count": count
            },
            ip_address=ip_address
        )

    # ==================== Leave ====================

    def log_leave_request(
        self,
        user_id: int,
        user_email: str,
        leave_request_id: int,
        employee_name: str,
        leave_type: str,
        days: float,
        ip_address: Optional[str] = None
    ):
        """Log leave request submission."""
        return self.log(
            action=AuditAction.LEAVE_REQUEST,
            resource_type="leave_request",
            user_id=user_id,
            user_email=user_email,
            resource_id=str(leave_request_id),
            new_value={
                "employee_name": employee_name,
                "leave_type": leave_type,
                "days": days
            },
            ip_address=ip_address
        )

    def log_leave_decision(
        self,
        user_id: int,
        user_email: str,
        leave_request_id: int,
        employee_name: str,
        leave_type: str,
        days: float,
        decision: str,
        notes: Optional[str] = None,
        ip_address: Optional[str] = None
    ):
        """Log leave approval or rejection."""
        action = AuditAction.LEAVE_APPROVE if decision == "approved" else AuditAction.LEAVE_REJECT
        return self.log(
            action=action,
            resource_type="leave_request",
            user_id=user_id,
            user_email=user_email,
            resource_id=str(leave_request_id),
            new_value={
                "employee_name": employee_name,
                "leave_type": leave_type,
                "days": days,
                "decision": decision
            },
            reason=notes,
            ip_address=ip_address
        )

    # ==================== Loans ====================

    def log_loan_create(
        self,
        user_id: int,
        user_email: str,
        loan_id: int,
        employee_name: str,
        loan_type: str,
        amount: float,
        ip_address: Optional[str] = None
    ):
        """Log loan creation."""
        return self.log(
            action=AuditAction.LOAN_CREATE,
            resource_type="loan",
            user_id=user_id,
            user_email=user_email,
            resource_id=str(loan_id),
            new_value={
                "employee_name": employee_name,
                "loan_type": loan_type,
                "principal_amount": amount
            },
            ip_address=ip_address
        )

    def log_loan_cancel(
        self,
        user_id: int,
        user_email: str,
        loan_id: int,
        employee_name: str,
        reason: str,
        ip_address: Optional[str] = None
    ):
        """Log loan cancellation."""
        return self.log(
            action=AuditAction.LOAN_CANCEL,
            resource_type="loan",
            user_id=user_id,
            user_email=user_email,
            resource_id=str(loan_id),
            extra_data={"employee_name": employee_name},
            reason=reason,
            ip_address=ip_address
        )

    # ==================== Backups ====================

    def log_backup_create(
        self,
        user_id: Optional[int],
        user_email: Optional[str],
        backup_name: str,
        size_mb: float,
        ip_address: Optional[str] = None
    ):
        """Log backup creation."""
        return self.log(
            action=AuditAction.BACKUP_CREATE,
            resource_type="backup",
            user_id=user_id,
            user_email=user_email or "scheduled",
            new_value={
                "backup_name": backup_name,
                "size_mb": size_mb
            },
            ip_address=ip_address
        )

    def log_backup_restore(
        self,
        user_id: int,
        user_email: str,
        backup_name: str,
        ip_address: Optional[str] = None
    ):
        """Log backup restore operation."""
        return self.log(
            action=AuditAction.BACKUP_RESTORE,
            resource_type="backup",
            user_id=user_id,
            user_email=user_email,
            new_value={"backup_name": backup_name},
            ip_address=ip_address
        )

    def log_backup_delete(
        self,
        user_id: int,
        user_email: str,
        backup_name: str,
        ip_address: Optional[str] = None
    ):
        """Log backup deletion."""
        return self.log(
            action=AuditAction.BACKUP_DELETE,
            resource_type="backup",
            user_id=user_id,
            user_email=user_email,
            old_value={"backup_name": backup_name},
            ip_address=ip_address
        )

    # ==================== Data Operations ====================

    def log_data_import(
        self,
        user_id: int,
        user_email: str,
        import_type: str,
        records_imported: int,
        errors: int = 0,
        ip_address: Optional[str] = None
    ):
        """Log data import operation."""
        return self.log(
            action=AuditAction.DATA_IMPORT,
            resource_type="import",
            user_id=user_id,
            user_email=user_email,
            new_value={
                "import_type": import_type,
                "records_imported": records_imported,
                "errors": errors
            },
            ip_address=ip_address
        )

    def log_data_export(
        self,
        user_id: int,
        user_email: str,
        export_type: str,
        records_exported: int,
        ip_address: Optional[str] = None
    ):
        """Log data export operation."""
        return self.log(
            action=AuditAction.DATA_EXPORT,
            resource_type="export",
            user_id=user_id,
            user_email=user_email,
            new_value={
                "export_type": export_type,
                "records_exported": records_exported
            },
            ip_address=ip_address
        )

    def log_report_generate(
        self,
        user_id: int,
        user_email: str,
        report_type: str,
        parameters: dict,
        ip_address: Optional[str] = None
    ):
        """Log report generation."""
        return self.log(
            action=AuditAction.REPORT_GENERATE,
            resource_type="report",
            user_id=user_id,
            user_email=user_email,
            new_value={
                "report_type": report_type,
                "parameters": parameters
            },
            ip_address=ip_address
        )

    # ==================== Employee ====================

    def log_employee_status_change(
        self,
        user_id: int,
        user_email: str,
        employee_id: int,
        employee_name: str,
        old_status: str,
        new_status: str,
        ip_address: Optional[str] = None
    ):
        """Log employee status change."""
        return self.log(
            action=AuditAction.EMPLOYEE_STATUS_CHANGE,
            resource_type="employee",
            user_id=user_id,
            user_email=user_email,
            resource_id=str(employee_id),
            old_value={"status": old_status},
            new_value={"status": new_status, "employee_name": employee_name},
            ip_address=ip_address
        )

    # ==================== Settings ====================

    def log_settings_update(
        self,
        user_id: int,
        user_email: str,
        setting_name: str,
        old_value: Any,
        new_value: Any,
        ip_address: Optional[str] = None
    ):
        """Log settings change."""
        return self.log(
            action=AuditAction.SETTINGS_UPDATE,
            resource_type="settings",
            user_id=user_id,
            user_email=user_email,
            resource_id=setting_name,
            old_value={"value": str(old_value)},
            new_value={"value": str(new_value)},
            ip_address=ip_address
        )

    # ==================== Query Methods ====================

    def get_recent_logs(
        self,
        limit: int = 100,
        action: Optional[AuditAction] = None,
        resource_type: Optional[str] = None,
        user_id: Optional[int] = None,
        days: int = 30
    ) -> List[AuditLog]:
        """Get recent audit log entries."""
        query = self.db.query(AuditLog)

        # Apply filters
        if action:
            query = query.filter(AuditLog.action == action)
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)
        if user_id:
            query = query.filter(AuditLog.user_id == user_id)

        # Filter by date
        cutoff = datetime.now() - timedelta(days=days)
        query = query.filter(AuditLog.timestamp >= cutoff)

        # Order by most recent first
        query = query.order_by(desc(AuditLog.timestamp))

        return query.limit(limit).all()

    def get_user_activity(
        self,
        user_id: int,
        limit: int = 50
    ) -> List[AuditLog]:
        """Get recent activity for a specific user."""
        return self.db.query(AuditLog)\
            .filter(AuditLog.user_id == user_id)\
            .order_by(desc(AuditLog.timestamp))\
            .limit(limit)\
            .all()

    def get_resource_history(
        self,
        resource_type: str,
        resource_id: str,
        limit: int = 50
    ) -> List[AuditLog]:
        """Get audit history for a specific resource."""
        return self.db.query(AuditLog)\
            .filter(
                AuditLog.resource_type == resource_type,
                AuditLog.resource_id == resource_id
            )\
            .order_by(desc(AuditLog.timestamp))\
            .limit(limit)\
            .all()

    def get_failed_logins(
        self,
        hours: int = 24,
        limit: int = 100
    ) -> List[AuditLog]:
        """Get recent failed login attempts."""
        cutoff = datetime.now() - timedelta(hours=hours)
        return self.db.query(AuditLog)\
            .filter(
                AuditLog.action == AuditAction.LOGIN_FAILED,
                AuditLog.timestamp >= cutoff
            )\
            .order_by(desc(AuditLog.timestamp))\
            .limit(limit)\
            .all()

    def count_failed_logins_by_ip(
        self,
        ip_address: str,
        minutes: int = 15
    ) -> int:
        """Count recent failed logins from an IP address."""
        cutoff = datetime.now() - timedelta(minutes=minutes)
        return self.db.query(AuditLog)\
            .filter(
                AuditLog.action == AuditAction.LOGIN_FAILED,
                AuditLog.ip_address == ip_address,
                AuditLog.timestamp >= cutoff
            )\
            .count()
