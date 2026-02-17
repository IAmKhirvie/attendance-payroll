"""
Payroll Schemas
===============
Pydantic models for payroll-related API operations.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date, datetime
from decimal import Decimal
from app.models.payroll import PayrollStatus, DeductionType


# === Deduction Config ===

class SalaryBracket(BaseModel):
    """Salary bracket for contribution calculation."""
    min_salary: Decimal
    max_salary: Decimal
    contribution: Decimal


class DeductionConfigCreate(BaseModel):
    """Create deduction config request."""
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    deduction_type: DeductionType
    description: Optional[str] = None
    is_percentage: bool = True
    rate: Decimal = Decimal("0")
    salary_brackets: Optional[List[SalaryBracket]] = None
    max_contribution: Optional[Decimal] = None
    min_contribution: Optional[Decimal] = None
    employee_share_percent: Decimal = Decimal("100")
    employer_share_percent: Decimal = Decimal("0")
    is_enabled: bool = True
    is_mandatory: bool = False
    effective_from: Optional[date] = None
    effective_until: Optional[date] = None


class DeductionConfigUpdate(BaseModel):
    """Update deduction config request."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    is_percentage: Optional[bool] = None
    rate: Optional[Decimal] = None
    salary_brackets: Optional[List[SalaryBracket]] = None
    max_contribution: Optional[Decimal] = None
    min_contribution: Optional[Decimal] = None
    employee_share_percent: Optional[Decimal] = None
    employer_share_percent: Optional[Decimal] = None
    is_enabled: Optional[bool] = None
    is_mandatory: Optional[bool] = None
    effective_from: Optional[date] = None
    effective_until: Optional[date] = None


class DeductionConfigResponse(BaseModel):
    """Deduction config response."""
    id: int
    code: str
    name: str
    deduction_type: DeductionType
    description: Optional[str]
    is_percentage: bool
    rate: Decimal
    salary_brackets: Optional[List[Dict[str, Any]]]
    max_contribution: Optional[Decimal]
    min_contribution: Optional[Decimal]
    employee_share_percent: Decimal
    employer_share_percent: Decimal
    is_enabled: bool
    is_mandatory: bool
    effective_from: Optional[date]
    effective_until: Optional[date]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# === Payroll Run ===

class PayrollRunCreate(BaseModel):
    """Create payroll run request."""
    period_start: date
    period_end: date
    cutoff: int = 1  # 1 = 1st half (1-15), 2 = 2nd half (16-end)
    pay_date: Optional[date] = None
    description: Optional[str] = None
    enabled_deductions: List[int] = []  # IDs of deduction configs to enable


class PayrollRunResponse(BaseModel):
    """Payroll run response."""
    id: int
    period_start: date
    period_end: date
    cutoff: int = 1  # 1 = 1st half, 2 = 2nd half
    pay_date: Optional[date]
    description: Optional[str]
    status: PayrollStatus
    enabled_deductions: Optional[List[int]]
    total_gross: Decimal
    total_deductions: Decimal
    total_net: Decimal
    employee_count: int
    run_by: Optional[int]
    run_at: Optional[datetime]
    approved_by: Optional[int]
    approved_at: Optional[datetime]
    locked_by: Optional[int]
    locked_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class PayrollRunListResponse(BaseModel):
    """Paginated payroll run list."""
    items: List[PayrollRunResponse]
    total: int
    page: int
    page_size: int


# === Payslip ===

class PayslipAdjustment(BaseModel):
    """Manual adjustment to payslip."""
    description: str
    amount: Decimal
    is_addition: bool = True  # True = add, False = deduct


class PayslipAdjustRequest(BaseModel):
    """Request to adjust a payslip."""
    adjustments: List[PayslipAdjustment]
    notes: str


class EarningsBreakdown(BaseModel):
    """Earnings breakdown."""
    basic: Decimal = Decimal("0")
    overtime: Decimal = Decimal("0")
    night_diff: Decimal = Decimal("0")
    allowances: Decimal = Decimal("0")
    other: Decimal = Decimal("0")


class DeductionsBreakdown(BaseModel):
    """Deductions breakdown."""
    sss: Decimal = Decimal("0")
    philhealth: Decimal = Decimal("0")
    pagibig: Decimal = Decimal("0")
    withholding_tax: Decimal = Decimal("0")
    loans: Decimal = Decimal("0")
    other: Decimal = Decimal("0")


class PayslipResponse(BaseModel):
    """Payslip response."""
    id: int
    payroll_run_id: int
    employee_id: int
    employee_name: str
    employee_no: str

    # Period
    period_start: date
    period_end: date

    # Earnings
    earnings: Dict[str, Any]
    total_earnings: Decimal

    # Deductions
    deductions: Dict[str, Any]
    total_deductions: Decimal

    # Net
    net_pay: Decimal

    # Attendance summary
    days_worked: Decimal
    days_absent: Decimal
    late_count: int
    total_late_minutes: int
    overtime_hours: Decimal
    undertime_minutes: int = 0

    # Attendance-based deductions
    absent_deduction: Decimal = Decimal("0")
    late_deduction: Decimal = Decimal("0")
    undertime_deduction: Decimal = Decimal("0")

    # Adjustments
    adjustments: Optional[List[Dict[str, Any]]]
    adjustment_notes: Optional[str]

    # Status
    is_released: bool
    released_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class PayslipListResponse(BaseModel):
    """Paginated payslip list."""
    items: List[PayslipResponse]
    total: int
    page: int
    page_size: int


# === Payroll Settings ===

class PayrollSettingsUpdate(BaseModel):
    """Update payroll settings request."""
    # Attendance-based deductions (PHP amounts)
    absent_rate_per_day: Optional[Decimal] = None
    late_rate_per_minute: Optional[Decimal] = None
    late_rate_per_incident: Optional[Decimal] = None
    undertime_rate_per_minute: Optional[Decimal] = None
    late_grace_minutes: Optional[int] = None

    # Standard government contribution rates
    default_sss: Optional[Decimal] = None
    default_philhealth: Optional[Decimal] = None
    default_pagibig: Optional[Decimal] = None
    default_tax: Optional[Decimal] = None

    # Overtime rates
    overtime_rate: Optional[Decimal] = None
    night_diff_rate: Optional[Decimal] = None
    holiday_rate: Optional[Decimal] = None
    special_holiday_rate: Optional[Decimal] = None

    # Work hours
    work_hours_per_day: Optional[Decimal] = None
    work_days_per_month: Optional[int] = None


class PayrollSettingsResponse(BaseModel):
    """Payroll settings response."""
    id: int
    # Attendance-based deductions
    absent_rate_per_day: Decimal
    late_rate_per_minute: Decimal
    late_rate_per_incident: Decimal
    undertime_rate_per_minute: Decimal
    late_grace_minutes: int

    # Government contribution defaults
    default_sss: Decimal
    default_philhealth: Decimal
    default_pagibig: Decimal
    default_tax: Decimal

    # Overtime rates
    overtime_rate: Decimal
    night_diff_rate: Decimal
    holiday_rate: Decimal
    special_holiday_rate: Decimal

    # Work hours
    work_hours_per_day: Decimal
    work_days_per_month: int

    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
