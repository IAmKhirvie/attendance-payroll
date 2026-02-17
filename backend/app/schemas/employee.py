"""
Employee Schemas
================
Pydantic models for employee-related API operations.
"""

from pydantic import BaseModel, EmailStr, Field
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
    phone: Optional[str] = Field(None, max_length=20)


class EmployeeCreate(EmployeeBase):
    """Create employee request."""
    department_id: Optional[int] = None
    position: Optional[str] = None
    employment_type: str = "regular"
    hire_date: Optional[date] = None
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


class EmployeeUpdate(BaseModel):
    """Update employee request."""
    employee_no: Optional[str] = Field(None, min_length=1, max_length=50)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    department_id: Optional[int] = None
    position: Optional[str] = None
    employment_type: Optional[str] = None
    hire_date: Optional[date] = None
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


class EmployeeResponse(EmployeeBase):
    """Employee response."""
    id: int
    department_id: Optional[int]
    department: Optional[DepartmentResponse] = None
    position: Optional[str]
    employment_type: str
    hire_date: Optional[date]
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
