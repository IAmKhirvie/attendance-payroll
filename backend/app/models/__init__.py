"""
Database Models
===============
All SQLAlchemy models for the application.
"""

from .user import User, Role, UserStatus
from .employee import Employee, Department
from .attendance import (
    Shift, BiometricDevice, RawAttendanceEvent,
    ProcessedAttendance, AttendanceStatus, CorrectionRequest, PunchType
)
from .payroll import (
    PayrollRun, Payslip, DeductionConfig, DeductionType, PayrollStatus,
    ContributionTable, ContributionType, PayrollSettings, ThirteenthMonthPay
)
from .audit import AuditLog, AuditAction
from .settings import SystemSettings
from .holiday import Holiday, HolidayType
from .loan import LoanTypeConfig, Loan, LoanDeduction, LoanType, LoanStatus
from .leave import LeaveTypeConfig, LeaveBalance, LeaveRequest, LeaveStatus

__all__ = [
    # User
    "User", "Role", "UserStatus",
    # Employee
    "Employee", "Department",
    # Attendance
    "Shift", "BiometricDevice", "RawAttendanceEvent",
    "ProcessedAttendance", "AttendanceStatus", "CorrectionRequest", "PunchType",
    # Payroll
    "PayrollRun", "Payslip", "DeductionConfig", "DeductionType", "PayrollStatus",
    "ContributionTable", "ContributionType", "PayrollSettings", "ThirteenthMonthPay",
    # Audit
    "AuditLog", "AuditAction",
    # Settings
    "SystemSettings",
    # Holiday
    "Holiday", "HolidayType",
    # Loan
    "LoanTypeConfig", "Loan", "LoanDeduction", "LoanType", "LoanStatus",
    # Leave
    "LeaveTypeConfig", "LeaveBalance", "LeaveRequest", "LeaveStatus",
]
