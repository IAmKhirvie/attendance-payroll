"""
System Settings Model
=====================
HR-configurable system settings including password policy.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class SystemSettings(Base):
    """
    System-wide settings configurable by HR/Admin.
    Single row table (singleton pattern).
    """
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, default=1)

    # Company Info
    company_name = Column(String(255), default="Company Name")
    company_address = Column(String(500), nullable=True)
    company_logo_path = Column(String(255), nullable=True)

    # Password Policy (HR configurable)
    password_min_length = Column(Integer, default=6)
    password_require_uppercase = Column(Boolean, default=False)
    password_require_numbers = Column(Boolean, default=False)
    password_require_special = Column(Boolean, default=False)
    password_expiry_days = Column(Integer, default=0)  # 0 = no expiry
    max_failed_login_attempts = Column(Integer, default=5)
    lockout_duration_minutes = Column(Integer, default=15)

    # Attendance Settings
    default_shift_id = Column(Integer, nullable=True)
    allow_early_in_minutes = Column(Integer, default=60)  # Allow punch X mins before shift
    auto_approve_attendance = Column(Boolean, default=False)

    # Payroll Settings
    payroll_day_1 = Column(Integer, default=15)  # First pay day of month
    payroll_day_2 = Column(Integer, default=30)  # Second pay day of month
    include_overtime_in_gross = Column(Boolean, default=True)
    include_night_diff_in_gross = Column(Boolean, default=True)

    # Self-Registration Settings
    allow_self_registration = Column(Boolean, default=True)
    require_approval_for_registration = Column(Boolean, default=True)
    default_role_for_registration = Column(String(20), default="employee")

    # Timestamps
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by = Column(Integer, nullable=True)

    def __repr__(self):
        return f"<SystemSettings {self.company_name}>"
