"""
Loan Schemas
============
Pydantic models for loan API operations.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from app.models.loan import LoanType, LoanStatus


# === Loan Type Config Schemas ===

class LoanTypeConfigCreate(BaseModel):
    """Create loan type configuration."""
    code: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    default_interest_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    is_active: bool = True


class LoanTypeConfigUpdate(BaseModel):
    """Update loan type configuration."""
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    default_interest_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    is_active: Optional[bool] = None


class LoanTypeConfigResponse(BaseModel):
    """Loan type configuration response."""
    id: int
    code: str
    name: str
    description: Optional[str]
    default_interest_rate: Decimal
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class LoanTypeConfigListResponse(BaseModel):
    """List of loan type configurations."""
    items: List[LoanTypeConfigResponse]
    total: int


# === Loan Schemas ===

class LoanCreate(BaseModel):
    """Create loan request."""
    employee_id: int
    loan_type_id: int
    reference_no: Optional[str] = Field(None, max_length=50)
    principal_amount: Decimal = Field(..., gt=0)
    interest_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    term_months: int = Field(..., ge=1, le=120)  # Max 10 years
    monthly_deduction: Decimal = Field(..., gt=0)
    start_date: date
    end_date: Optional[date] = None
    notes: Optional[str] = None


class LoanUpdate(BaseModel):
    """Update loan request."""
    reference_no: Optional[str] = Field(None, max_length=50)
    interest_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    term_months: Optional[int] = Field(None, ge=1, le=120)
    monthly_deduction: Optional[Decimal] = Field(None, gt=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[LoanStatus] = None
    notes: Optional[str] = None


class LoanResponse(BaseModel):
    """Loan response."""
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_no: Optional[str] = None
    loan_type_id: int
    loan_type_code: Optional[str] = None
    loan_type_name: Optional[str] = None
    reference_no: Optional[str]
    principal_amount: Decimal
    interest_rate: Decimal
    total_amount: Decimal
    term_months: int
    monthly_deduction: Decimal
    start_date: date
    end_date: Optional[date]
    actual_end_date: Optional[date]
    remaining_balance: Decimal
    total_paid: Decimal
    status: LoanStatus
    notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    created_by: Optional[int]

    class Config:
        from_attributes = True


class LoanListResponse(BaseModel):
    """List of loans."""
    items: List[LoanResponse]
    total: int


class LoanSummary(BaseModel):
    """Loan summary for an employee."""
    employee_id: int
    total_loans: int
    active_loans: int
    total_principal: Decimal
    total_remaining: Decimal
    total_paid: Decimal
    monthly_deductions: Decimal  # Sum of all active monthly deductions


# === Loan Deduction Schemas ===

class LoanDeductionCreate(BaseModel):
    """Create loan deduction manually."""
    loan_id: int
    amount: Decimal = Field(..., gt=0)
    deduction_date: date
    payslip_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=200)


class LoanDeductionResponse(BaseModel):
    """Loan deduction response."""
    id: int
    loan_id: int
    payslip_id: Optional[int]
    amount: Decimal
    balance_before: Decimal
    balance_after: Decimal
    deduction_date: date
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class LoanDeductionListResponse(BaseModel):
    """List of loan deductions."""
    items: List[LoanDeductionResponse]
    total: int


# === Amortization Schedule ===

class AmortizationEntry(BaseModel):
    """Single entry in amortization schedule."""
    month: int
    date: date
    payment: Decimal
    principal: Decimal
    interest: Decimal
    balance: Decimal


class AmortizationSchedule(BaseModel):
    """Full amortization schedule."""
    loan_id: int
    principal: Decimal
    interest_rate: Decimal
    total_amount: Decimal
    monthly_payment: Decimal
    term_months: int
    schedule: List[AmortizationEntry]
