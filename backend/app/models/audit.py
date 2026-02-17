"""
Audit Log Model
===============
Immutable audit trail for all sensitive actions.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, Enum as SQLEnum, JSON
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class AuditAction(str, enum.Enum):
    """Types of auditable actions."""
    # Authentication
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGE = "password_change"

    # User management
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_APPROVE = "user_approve"
    USER_DEACTIVATE = "user_deactivate"

    # Employee
    EMPLOYEE_CREATE = "employee_create"
    EMPLOYEE_UPDATE = "employee_update"
    EMPLOYEE_DELETE = "employee_delete"

    # Attendance
    ATTENDANCE_IMPORT = "attendance_import"
    ATTENDANCE_EDIT = "attendance_edit"
    ATTENDANCE_APPROVE = "attendance_approve"
    PUNCH_ADD = "punch_add"
    PUNCH_EDIT = "punch_edit"
    PUNCH_DELETE = "punch_delete"

    # Corrections
    CORRECTION_REQUEST = "correction_request"
    CORRECTION_APPROVE = "correction_approve"
    CORRECTION_REJECT = "correction_reject"

    # Payroll
    PAYROLL_CREATE = "payroll_create"
    PAYROLL_RUN = "payroll_run"
    PAYROLL_ADJUST = "payroll_adjust"
    PAYROLL_APPROVE = "payroll_approve"
    PAYROLL_LOCK = "payroll_lock"
    PAYROLL_EXPORT = "payroll_export"
    PAYSLIP_VIEW = "payslip_view"

    # Deductions
    DEDUCTION_CONFIG_CREATE = "deduction_config_create"
    DEDUCTION_CONFIG_UPDATE = "deduction_config_update"

    # Settings
    SETTINGS_UPDATE = "settings_update"

    # Data export
    DATA_EXPORT = "data_export"
    REPORT_GENERATE = "report_generate"


class AuditLog(Base):
    """
    Immutable audit log entry.
    Cannot be modified or deleted after creation.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    # When
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Who
    user_id = Column(Integer, nullable=True, index=True)  # NULL for system actions
    user_email = Column(String(255), nullable=True)  # Denormalized for history

    # What
    action = Column(SQLEnum(AuditAction), nullable=False, index=True)
    resource_type = Column(String(50), nullable=False)  # e.g., "user", "attendance", "payroll"
    resource_id = Column(String(50), nullable=True)  # ID of affected resource

    # Changes
    old_value = Column(JSON, nullable=True)  # Previous state
    new_value = Column(JSON, nullable=True)  # New state
    reason = Column(Text, nullable=True)  # Required for edits

    # Context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)

    # Extra data
    extra_data = Column(JSON, nullable=True)

    def __repr__(self):
        return f"<AuditLog {self.action.value} by user {self.user_id} @ {self.timestamp}>"
