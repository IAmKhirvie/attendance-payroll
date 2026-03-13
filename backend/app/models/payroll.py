"""
Payroll Models
==============
Payroll runs, payslips, and configurable deductions (PH-specific).
All deductions are configurable, not hard-coded.
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date,
    ForeignKey, Numeric, Text, Enum as SQLEnum, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class DeductionType(str, enum.Enum):
    """Types of deductions (PH-specific but configurable)."""
    SSS = "sss"
    PHILHEALTH = "philhealth"
    PAGIBIG = "pagibig"
    WITHHOLDING_TAX = "withholding_tax"
    COMPANY_LOAN = "company_loan"
    CASH_ADVANCE = "cash_advance"
    OTHER = "other"


class DeductionConfig(Base):
    """Configurable deduction settings (PH-specific)."""
    __tablename__ = "deduction_configs"

    id = Column(Integer, primary_key=True, index=True)

    # Deduction identification
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    deduction_type = Column(SQLEnum(DeductionType), nullable=False)
    description = Column(Text, nullable=True)

    # Calculation method
    is_percentage = Column(Boolean, default=True)  # True = %, False = fixed
    rate = Column(Numeric(10, 4), default=0)  # Percentage rate or fixed amount

    # Salary brackets (for SSS, PhilHealth, etc.)
    # Stored as JSON: [{"min": 0, "max": 5000, "contribution": 500}, ...]
    salary_brackets = Column(JSON, nullable=True)

    # Caps
    max_contribution = Column(Numeric(12, 2), nullable=True)
    min_contribution = Column(Numeric(12, 2), nullable=True)

    # Employee/Employer share
    employee_share_percent = Column(Numeric(5, 2), default=100)  # % paid by employee
    employer_share_percent = Column(Numeric(5, 2), default=0)

    # Status
    is_enabled = Column(Boolean, default=True)
    is_mandatory = Column(Boolean, default=False)

    # Effective date (for versioning)
    effective_from = Column(Date, nullable=True)
    effective_until = Column(Date, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    def __repr__(self):
        return f"<DeductionConfig {self.code}: {self.name}>"


class PayrollStatus(str, enum.Enum):
    """Payroll run status."""
    DRAFT = "draft"        # Being prepared
    PROCESSING = "processing"  # Calculating
    REVIEW = "review"      # Ready for review
    APPROVED = "approved"  # Approved, not yet locked
    LOCKED = "locked"      # Locked, finalized
    EXPORTED = "exported"  # Exported to files


class PayrollRun(Base):
    """Payroll run for a pay period."""
    __tablename__ = "payroll_runs"

    id = Column(Integer, primary_key=True, index=True)

    # Period
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    pay_date = Column(Date, nullable=True)

    # Cutoff (1 = 1st half 1-15, 2 = 2nd half 16-end of month)
    # 1st cutoff: deduct loans, tax
    # 2nd cutoff: deduct sss, philhealth, pagibig, tax
    cutoff = Column(Integer, default=1)

    # Description
    description = Column(String(255), nullable=True)  # e.g., "January 2024 - 1st Half"

    # Status
    status = Column(SQLEnum(PayrollStatus), default=PayrollStatus.DRAFT)

    # Enabled deductions for this run (JSON array of deduction config IDs)
    enabled_deductions = Column(JSON, nullable=True)

    # Totals (calculated)
    total_gross = Column(Numeric(15, 2), default=0)
    total_deductions = Column(Numeric(15, 2), default=0)
    total_net = Column(Numeric(15, 2), default=0)
    employee_count = Column(Integer, default=0)

    # Processing
    run_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    run_at = Column(DateTime(timezone=True), nullable=True)

    # Approval
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)

    # Lock
    locked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)

    # Soft Delete (Trash)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    deletion_reason = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    payslips = relationship("Payslip", back_populates="payroll_run")
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    def __repr__(self):
        return f"<PayrollRun {self.period_start} to {self.period_end}: {self.status.value}>"


class PayrollSettings(Base):
    """Universal payroll settings and deduction rates."""
    __tablename__ = "payroll_settings"

    id = Column(Integer, primary_key=True, index=True)

    # Attendance-based deductions (PHP amounts)
    absent_rate_per_day = Column(Numeric(10, 2), default=0)  # PHP per absent day
    late_rate_per_minute = Column(Numeric(10, 2), default=0)  # PHP per minute late
    late_rate_per_incident = Column(Numeric(10, 2), default=0)  # PHP per late incident
    undertime_rate_per_minute = Column(Numeric(10, 2), default=0)  # PHP per undertime minute

    # Late grace period (minutes before late deduction applies)
    late_grace_minutes = Column(Integer, default=15)

    # Default salary (used as base for new employees and rate calculations)
    default_basic_salary = Column(Numeric(12, 2), default=0)  # Default monthly basic salary

    # Standard government contribution rates (used if employee doesn't have specific values)
    default_sss = Column(Numeric(10, 2), default=0)  # Standard SSS contribution
    default_philhealth = Column(Numeric(10, 2), default=0)  # Standard PhilHealth
    default_pagibig = Column(Numeric(10, 2), default=0)  # Standard Pag-IBIG
    default_tax = Column(Numeric(10, 2), default=0)  # Standard tax withholding

    # Overtime rates (multipliers)
    overtime_rate = Column(Numeric(5, 2), default=1.25)  # Regular OT
    night_diff_rate = Column(Numeric(5, 2), default=1.10)  # Night differential
    holiday_rate = Column(Numeric(5, 2), default=2.00)  # Regular holiday
    special_holiday_rate = Column(Numeric(5, 2), default=1.30)  # Special non-working holiday

    # Work hours calculation
    work_hours_per_day = Column(Numeric(4, 2), default=8)  # Standard work hours
    work_days_per_month = Column(Integer, default=22)  # For daily rate calculation

    # ICAN Formula Settings
    # Daily Rate = Monthly Salary × 12 ÷ 261 (working days per year)
    # Minute Rate = Daily Rate ÷ Hours per day ÷ 60
    use_ican_formula = Column(Boolean, default=True)  # Use ICAN attendance deduction formula
    working_days_per_year = Column(Integer, default=261)  # For daily rate calculation (ICAN: 261)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    def __repr__(self):
        return f"<PayrollSettings id={self.id}>"


class ThirteenthMonthPay(Base):
    """13th Month Pay record for employees (Philippine requirement)."""
    __tablename__ = "thirteenth_month_pay"

    id = Column(Integer, primary_key=True, index=True)

    # Employee
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)

    # Year
    year = Column(Integer, nullable=False, index=True)

    # Calculation basis
    total_basic_earned = Column(Numeric(15, 2), default=0)  # Sum of basic salary earned in the year
    months_worked = Column(Integer, default=0)  # Number of months employee worked

    # Amount
    amount = Column(Numeric(12, 2), default=0)  # 13th month pay amount (total_basic_earned / 12)

    # Status
    is_released = Column(Boolean, default=False)
    released_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    employee = relationship("Employee")

    def __repr__(self):
        return f"<ThirteenthMonthPay {self.employee_id} - {self.year}: {self.amount}>"


class Payslip(Base):
    """Individual employee payslip."""
    __tablename__ = "payslips"

    id = Column(Integer, primary_key=True, index=True)

    # Links
    payroll_run_id = Column(Integer, ForeignKey("payroll_runs.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)

    # Earnings breakdown (stored as JSON for flexibility)
    # e.g., {"basic": 15000, "overtime": 1500, "night_diff": 500, "allowances": 2000}
    earnings = Column(JSON, nullable=False, default={})

    # Deductions breakdown (stored as JSON)
    # e.g., {"sss": 500, "philhealth": 300, "pagibig": 100, "tax": 1000}
    deductions = Column(JSON, nullable=False, default={})

    # Totals
    total_earnings = Column(Numeric(12, 2), default=0)
    total_deductions = Column(Numeric(12, 2), default=0)
    net_pay = Column(Numeric(12, 2), default=0)

    # Attendance summary
    days_worked = Column(Numeric(5, 2), default=0)
    days_absent = Column(Numeric(5, 2), default=0)
    late_count = Column(Integer, default=0)
    total_late_minutes = Column(Integer, default=0)
    overtime_hours = Column(Numeric(6, 2), default=0)
    undertime_minutes = Column(Integer, default=0)

    # Attendance-based deductions (calculated)
    absent_deduction = Column(Numeric(12, 2), default=0)
    late_deduction = Column(Numeric(12, 2), default=0)
    undertime_deduction = Column(Numeric(12, 2), default=0)

    # HR Adjustments (manual overrides)
    adjustments = Column(JSON, nullable=True)  # {"reason": "...", "amount": 500}
    adjustment_notes = Column(Text, nullable=True)

    # Status
    is_released = Column(Boolean, default=False)  # Visible to employee
    released_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    payroll_run = relationship("PayrollRun", back_populates="payslips")
    employee = relationship("Employee", back_populates="payslips")

    def __repr__(self):
        return f"<Payslip {self.employee_id} - Net: {self.net_pay}>"
