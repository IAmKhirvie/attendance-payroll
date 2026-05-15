"""
Employee Schemas
================
Pydantic models for employee-related API operations.
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class DepartmentBase(BaseModel):
    """Base department schema."""
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=20)
    description: Optional[str] = None


class DepartmentCreate(DepartmentBase):
    """Create department request."""
    pass


class DepartmentUpdate(BaseModel):
    """Update department request."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentResponse(DepartmentBase):
    """Department response."""
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class EmployeeBase(BaseModel):
    """Base employee schema."""
    employee_no: str = Field(..., min_length=1, max_length=50)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=100)


class EmployeeCreate(EmployeeBase):
    """Create employee request."""
    department_id: Optional[int] = None
    position: Optional[str] = None
    employment_type: str = "regular"
    hire_date: Optional[date] = None
    end_date: Optional[date] = None  # Contract end date or resignation date
    shift_id: Optional[int] = None
    basic_salary: Decimal = Decimal("0")
    daily_rate: Decimal = Decimal("0")
    hourly_rate: Decimal = Decimal("0")
    allowance: Decimal = Decimal("0")
    productivity_incentive: Decimal = Decimal("0")
    language_incentive: Decimal = Decimal("0")
    biometric_id: Optional[str] = None
    # Government contributions
    sss_contribution: Optional[Decimal] = None
    philhealth_contribution: Optional[Decimal] = None
    pagibig_contribution: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    # Schedule settings
    call_time: Optional[str] = "08:00"
    time_out: Optional[str] = "17:00"
    work_hours_per_day: Optional[Decimal] = Decimal("8")
    buffer_minutes: Optional[int] = 10
    is_flexible: bool = False
    adjusted_call_time: Optional[str] = None  # For flexible schedules
    # Working days
    work_monday: bool = True
    work_tuesday: bool = True
    work_wednesday: bool = True
    work_thursday: bool = True
    work_friday: bool = True
    work_saturday: bool = False
    work_sunday: bool = False

    @field_validator('work_hours_per_day')
    @classmethod
    def validate_work_hours(cls, v):
        if v is not None:
            if v < 1 or v > 24:
                raise ValueError('work_hours_per_day must be between 1 and 24')
        return v

    @field_validator('buffer_minutes')
    @classmethod
    def validate_buffer_minutes(cls, v):
        if v is not None:
            if v < 0 or v > 120:
                raise ValueError('buffer_minutes must be between 0 and 120')
        return v

    @field_validator('basic_salary', 'daily_rate', 'hourly_rate', 'allowance')
    @classmethod
    def validate_positive_amounts(cls, v):
        if v is not None and v < 0:
            raise ValueError('Amount cannot be negative')
        return v


class EmployeeUpdate(BaseModel):
    """Update employee request."""
    employee_no: Optional[str] = Field(None, min_length=1, max_length=50)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=100)
    department_id: Optional[int] = None
    position: Optional[str] = None
    employment_type: Optional[str] = None
    hire_date: Optional[date] = None
    end_date: Optional[date] = None  # Contract end date or resignation date
    shift_id: Optional[int] = None
    basic_salary: Optional[Decimal] = None
    daily_rate: Optional[Decimal] = None
    hourly_rate: Optional[Decimal] = None
    allowance: Optional[Decimal] = None
    productivity_incentive: Optional[Decimal] = None
    language_incentive: Optional[Decimal] = None
    biometric_id: Optional[str] = None
    status: Optional[str] = None  # pending, active, inactive
    is_active: Optional[bool] = None
    # Government contributions
    sss_contribution: Optional[Decimal] = None
    philhealth_contribution: Optional[Decimal] = None
    pagibig_contribution: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    # Schedule settings
    call_time: Optional[str] = None
    time_out: Optional[str] = None
    work_hours_per_day: Optional[Decimal] = None
    buffer_minutes: Optional[int] = None
    is_flexible: Optional[bool] = None
    adjusted_call_time: Optional[str] = None
    # Working days
    work_monday: Optional[bool] = None
    work_tuesday: Optional[bool] = None
    work_wednesday: Optional[bool] = None
    work_thursday: Optional[bool] = None
    work_friday: Optional[bool] = None
    work_saturday: Optional[bool] = None
    work_sunday: Optional[bool] = None

    @field_validator('work_hours_per_day')
    @classmethod
    def validate_work_hours(cls, v):
        if v is not None:
            if v < 1 or v > 24:
                raise ValueError('work_hours_per_day must be between 1 and 24')
        return v

    @field_validator('buffer_minutes')
    @classmethod
    def validate_buffer_minutes(cls, v):
        if v is not None:
            if v < 0 or v > 120:
                raise ValueError('buffer_minutes must be between 0 and 120')
        return v

    @field_validator('basic_salary', 'daily_rate', 'hourly_rate', 'allowance')
    @classmethod
    def validate_positive_amounts(cls, v):
        if v is not None and v < 0:
            raise ValueError('Amount cannot be negative')
        return v


class EmployeeResponse(EmployeeBase):
    """Employee response."""
    id: int
    department_id: Optional[int]
    department: Optional[DepartmentResponse] = None
    position: Optional[str]
    employment_type: str
    hire_date: Optional[date]
    end_date: Optional[date] = None  # Contract end date or resignation date
    shift_id: Optional[int]
    basic_salary: Decimal
    daily_rate: Decimal
    hourly_rate: Decimal
    allowance: Decimal = Decimal("0")
    productivity_incentive: Decimal = Decimal("0")
    language_incentive: Decimal = Decimal("0")
    biometric_id: Optional[str]
    # Government contributions
    sss_contribution: Optional[Decimal] = None
    philhealth_contribution: Optional[Decimal] = None
    pagibig_contribution: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    # Schedule settings
    call_time: Optional[str] = "08:00"
    time_out: Optional[str] = "17:00"
    work_hours_per_day: Optional[Decimal] = Decimal("8")
    buffer_minutes: Optional[int] = 10
    is_flexible: bool = False
    adjusted_call_time: Optional[str] = None
    # Working days
    work_monday: bool = True
    work_tuesday: bool = True
    work_wednesday: bool = True
    work_thursday: bool = True
    work_friday: bool = True
    work_saturday: bool = False
    work_sunday: bool = False
    working_days_per_week: int = 5
    status: Optional[str] = "active"  # pending, active, inactive
    is_active: bool
    full_name: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class EmployeeListResponse(BaseModel):
    """Paginated employee list."""
    items: list[EmployeeResponse]
    total: int
    page: int
    page_size: int
