"""
Leave Management Models
=======================
Leave types, balances, and requests for employee leave management.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text, Enum as SQLEnum, ForeignKey, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class LeaveStatus(str, enum.Enum):
    """Leave request status."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LeaveTypeConfig(Base):
    """
    Leave type configuration.
    Defines available leave types with default entitlements.
    """
    __tablename__ = "leave_types"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    # Default entitlement per year
    default_days_per_year = Column(Numeric(5, 2), default=0)

    # Leave properties
    is_paid = Column(Boolean, default=True)
    requires_document = Column(Boolean, default=False)  # e.g., medical cert for sick leave
    max_consecutive_days = Column(Integer, nullable=True)  # Max days in a single request
    min_notice_days = Column(Integer, default=0)  # Advance notice required

    # Accrual settings
    is_accrued = Column(Boolean, default=False)  # Earned monthly vs all at once
    accrual_rate_per_month = Column(Numeric(5, 2), nullable=True)  # Days earned per month

    # Carry over settings
    can_carry_over = Column(Boolean, default=False)
    max_carry_over_days = Column(Numeric(5, 2), nullable=True)

    # Status
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    balances = relationship("LeaveBalance", back_populates="leave_type")
    requests = relationship("LeaveRequest", back_populates="leave_type")

    def __repr__(self):
        return f"<LeaveType {self.code}: {self.name}>"


class LeaveBalance(Base):
    """
    Employee leave balance for a specific year.
    Tracks entitled, used, pending, and remaining days.
    """
    __tablename__ = "leave_balances"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)

    # Balance tracking
    entitled_days = Column(Numeric(5, 2), default=0)  # Total entitled for the year
    used_days = Column(Numeric(5, 2), default=0)  # Already taken
    pending_days = Column(Numeric(5, 2), default=0)  # Pending approval
    carried_over_days = Column(Numeric(5, 2), default=0)  # From previous year

    # Computed remaining
    @property
    def remaining_days(self):
        return float(self.entitled_days + self.carried_over_days - self.used_days - self.pending_days)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employee = relationship("Employee", backref="leave_balances")
    leave_type = relationship("LeaveTypeConfig", back_populates="balances")

    # Unique constraint: one balance per employee/type/year
    __table_args__ = (
        # UniqueConstraint('employee_id', 'leave_type_id', 'year', name='uq_leave_balance'),
    )

    def __repr__(self):
        return f"<LeaveBalance {self.employee_id} - {self.leave_type_id} ({self.year})>"


class LeaveRequest(Base):
    """
    Employee leave request.
    Tracks leave applications with approval workflow.
    """
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id"), nullable=False, index=True)

    # Leave period
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    total_days = Column(Numeric(5, 2), nullable=False)  # Calculated based on working days

    # Half day support
    is_half_day = Column(Boolean, default=False)
    half_day_period = Column(String(10), nullable=True)  # 'morning' or 'afternoon'

    # Request details
    reason = Column(Text, nullable=True)
    contact_number = Column(String(20), nullable=True)  # Emergency contact while on leave
    attachment_path = Column(String(255), nullable=True)  # Supporting document

    # Status
    status = Column(SQLEnum(LeaveStatus), default=LeaveStatus.PENDING, index=True)

    # Approval workflow
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employee = relationship("Employee", backref="leave_requests")
    leave_type = relationship("LeaveTypeConfig", back_populates="requests")
    reviewer = relationship("User", foreign_keys=[reviewed_by])

    def __repr__(self):
        return f"<LeaveRequest {self.id}: {self.employee_id} ({self.start_date} - {self.end_date})>"

    @property
    def is_pending(self):
        return self.status == LeaveStatus.PENDING
