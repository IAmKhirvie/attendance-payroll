"""
Loan Models
===========
Loan tracking system for employee loans and deductions.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text, Enum as SQLEnum, ForeignKey, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class LoanType(str, enum.Enum):
    """Types of loans."""
    COMPANY = "company"  # Company Loan
    SSS = "sss"  # SSS Salary Loan
    SSS_CAL = "sss_calamity"  # SSS Calamity Loan
    PAGIBIG = "pagibig"  # Pag-IBIG Multi-Purpose Loan
    PAGIBIG_CAL = "pagibig_calamity"  # Pag-IBIG Calamity Loan
    CASH_ADVANCE = "cash_advance"  # Cash Advance
    OTHER = "other"  # Other loans


class LoanStatus(str, enum.Enum):
    """Loan status."""
    ACTIVE = "active"  # Ongoing loan with balance
    PAID = "paid"  # Fully paid
    CANCELLED = "cancelled"  # Cancelled/written off


class LoanTypeConfig(Base):
    """
    Loan type configuration.
    Defines available loan types with default interest rates.
    """
    __tablename__ = "loan_types"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    default_interest_rate = Column(Numeric(5, 2), default=0)  # Annual interest rate %
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    loans = relationship("Loan", back_populates="loan_type_config")

    def __repr__(self):
        return f"<LoanTypeConfig {self.code}: {self.name}>"


class Loan(Base):
    """
    Individual employee loan.
    Tracks principal, interest, payments, and remaining balance.
    """
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    loan_type_id = Column(Integer, ForeignKey("loan_types.id"), nullable=False, index=True)

    # Loan reference number (for SSS, Pag-IBIG, etc.)
    reference_no = Column(String(50), nullable=True)

    # Loan amounts
    principal_amount = Column(Numeric(12, 2), nullable=False)  # Original loan amount
    interest_rate = Column(Numeric(5, 2), default=0)  # Interest rate %
    total_amount = Column(Numeric(12, 2), nullable=False)  # Principal + computed interest

    # Payment terms
    term_months = Column(Integer, nullable=False)  # Number of months to pay
    monthly_deduction = Column(Numeric(12, 2), nullable=False)  # Amount deducted per month

    # Dates
    start_date = Column(Date, nullable=False)  # When deductions start
    end_date = Column(Date, nullable=True)  # Expected end date (can be null for indefinite)
    actual_end_date = Column(Date, nullable=True)  # Actual end date when fully paid

    # Balance tracking
    remaining_balance = Column(Numeric(12, 2), nullable=False)  # Current remaining balance
    total_paid = Column(Numeric(12, 2), default=0)  # Total amount paid so far

    # Status
    status = Column(SQLEnum(LoanStatus), default=LoanStatus.ACTIVE, index=True)

    # Notes
    notes = Column(Text, nullable=True)

    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    employee = relationship("Employee", backref="loans")
    loan_type_config = relationship("LoanTypeConfig", back_populates="loans")
    deductions = relationship("LoanDeduction", back_populates="loan", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<Loan {self.id}: {self.employee_id} - {self.principal_amount}>"

    @property
    def is_paid(self):
        return self.remaining_balance <= 0 or self.status == LoanStatus.PAID


class LoanDeduction(Base):
    """
    Individual loan deduction record.
    Links loan payments to payslips for tracking.
    """
    __tablename__ = "loan_deductions"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=False, index=True)
    payslip_id = Column(Integer, ForeignKey("payslips.id"), nullable=True, index=True)

    # Deduction details
    amount = Column(Numeric(12, 2), nullable=False)  # Amount deducted
    balance_before = Column(Numeric(12, 2), nullable=False)  # Balance before this deduction
    balance_after = Column(Numeric(12, 2), nullable=False)  # Balance after this deduction

    # Date of deduction
    deduction_date = Column(Date, nullable=False)

    # Notes (e.g., "Partial payment", "Final payment")
    notes = Column(String(200), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    loan = relationship("Loan", back_populates="deductions")
    payslip = relationship("Payslip", backref="loan_deductions")

    def __repr__(self):
        return f"<LoanDeduction {self.id}: {self.amount} on {self.deduction_date}>"
