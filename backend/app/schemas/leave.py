"""
Leave Schemas
=============
Pydantic models for leave management API operations.
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from app.models.leave import LeaveStatus


# === Leave Type Config Schemas ===

class LeaveTypeConfigCreate(BaseModel):
    """Create leave type configuration."""
    code: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    default_days_per_year: Decimal = Field(default=Decimal("0"), ge=0, le=365)
    is_paid: bool = True
    requires_document: bool = False
    max_consecutive_days: Optional[int] = Field(None, ge=1)
    min_notice_days: int = Field(default=0, ge=0)
    is_accrued: bool = False
    accrual_rate_per_month: Optional[Decimal] = Field(None, ge=0, le=30)
    can_carry_over: bool = False
    max_carry_over_days: Optional[Decimal] = Field(None, ge=0)
    is_active: bool = True


class LeaveTypeConfigUpdate(BaseModel):
    """Update leave type configuration."""
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    default_days_per_year: Optional[Decimal] = Field(None, ge=0, le=365)
    is_paid: Optional[bool] = None
    requires_document: Optional[bool] = None
    max_consecutive_days: Optional[int] = Field(None, ge=1)
    min_notice_days: Optional[int] = Field(None, ge=0)
    is_accrued: Optional[bool] = None
    accrual_rate_per_month: Optional[Decimal] = Field(None, ge=0, le=30)
    can_carry_over: Optional[bool] = None
    max_carry_over_days: Optional[Decimal] = Field(None, ge=0)
    is_active: Optional[bool] = None


class LeaveTypeConfigResponse(BaseModel):
    """Leave type configuration response."""
    id: int
    code: str
    name: str
    description: Optional[str]
    default_days_per_year: Decimal
    is_paid: bool
    requires_document: bool
    max_consecutive_days: Optional[int]
    min_notice_days: int
    is_accrued: bool
    accrual_rate_per_month: Optional[Decimal]
    can_carry_over: bool
    max_carry_over_days: Optional[Decimal]
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class LeaveTypeConfigListResponse(BaseModel):
    """List of leave type configurations."""
    items: List[LeaveTypeConfigResponse]
    total: int


# === Leave Balance Schemas ===

class LeaveBalanceCreate(BaseModel):
    """Create leave balance for an employee."""
    employee_id: int
    leave_type_id: int
    year: int = Field(..., ge=2020, le=2100)
    entitled_days: Decimal = Field(default=Decimal("0"), ge=0)
    carried_over_days: Decimal = Field(default=Decimal("0"), ge=0)


class LeaveBalanceUpdate(BaseModel):
    """Update leave balance."""
    entitled_days: Optional[Decimal] = Field(None, ge=0)
    used_days: Optional[Decimal] = Field(None, ge=0)
    pending_days: Optional[Decimal] = Field(None, ge=0)
    carried_over_days: Optional[Decimal] = Field(None, ge=0)


class LeaveBalanceResponse(BaseModel):
    """Leave balance response."""
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_no: Optional[str] = None
    leave_type_id: int
    leave_type_code: Optional[str] = None
    leave_type_name: Optional[str] = None
    year: int
    entitled_days: Decimal
    used_days: Decimal
    pending_days: Decimal
    carried_over_days: Decimal
    remaining_days: Decimal
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class LeaveBalanceListResponse(BaseModel):
    """List of leave balances."""
    items: List[LeaveBalanceResponse]
    total: int


class EmployeeLeaveBalanceSummary(BaseModel):
    """Leave balance summary for an employee."""
    employee_id: int
    year: int
    balances: List[LeaveBalanceResponse]
    total_entitled: Decimal
    total_used: Decimal
    total_remaining: Decimal


# === Leave Request Schemas ===

class LeaveRequestCreate(BaseModel):
    """Create leave request."""
    employee_id: int
    leave_type_id: int
    start_date: date
    end_date: date
    is_half_day: bool = False
    half_day_period: Optional[str] = None  # 'morning' or 'afternoon'
    reason: Optional[str] = None
    contact_number: Optional[str] = Field(None, max_length=20)

    @model_validator(mode='after')
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError('end_date must be after or equal to start_date')
        if self.is_half_day and not self.half_day_period:
            raise ValueError('half_day_period is required when is_half_day is True')
        if self.is_half_day and self.start_date != self.end_date:
            raise ValueError('Half day leave must be for a single day')
        return self


class LeaveRequestUpdate(BaseModel):
    """Update leave request (before approval)."""
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_half_day: Optional[bool] = None
    half_day_period: Optional[str] = None
    reason: Optional[str] = None
    contact_number: Optional[str] = Field(None, max_length=20)


class LeaveRequestResponse(BaseModel):
    """Leave request response."""
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_no: Optional[str] = None
    leave_type_id: int
    leave_type_code: Optional[str] = None
    leave_type_name: Optional[str] = None
    start_date: date
    end_date: date
    total_days: Decimal
    is_half_day: bool
    half_day_period: Optional[str]
    reason: Optional[str]
    contact_number: Optional[str]
    attachment_path: Optional[str]
    status: LeaveStatus
    reviewed_by: Optional[int]
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime]
    review_notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class LeaveRequestListResponse(BaseModel):
    """List of leave requests."""
    items: List[LeaveRequestResponse]
    total: int


class LeaveRequestApproval(BaseModel):
    """Leave request approval/rejection."""
    status: LeaveStatus = Field(..., description="Must be 'approved' or 'rejected'")
    review_notes: Optional[str] = None

    @model_validator(mode='after')
    def validate_status(self):
        if self.status not in [LeaveStatus.APPROVED, LeaveStatus.REJECTED]:
            raise ValueError('Status must be approved or rejected')
        return self


# === Bulk Operations ===

class BulkLeaveBalanceCreate(BaseModel):
    """Initialize leave balances for multiple employees."""
    employee_ids: List[int]
    year: int = Field(..., ge=2020, le=2100)
    use_defaults: bool = True  # Use leave type default days


class LeaveCalendarEntry(BaseModel):
    """Calendar entry for leave visualization."""
    date: date
    employee_id: int
    employee_name: str
    leave_type: str
    status: LeaveStatus
    is_half_day: bool
    half_day_period: Optional[str]
