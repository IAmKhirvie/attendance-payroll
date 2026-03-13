"""
Employee Model
==============
Employee records with department and shift assignments.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Numeric, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Department(Base):
    """Department/Division model."""
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employees = relationship("Employee", back_populates="department")

    def __repr__(self):
        return f"<Department {self.code}: {self.name}>"


class Employee(Base):
    """Employee record model."""
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)

    # Employee ID (company assigned)
    employee_no = Column(String(50), unique=True, index=True, nullable=False)

    # Personal Info
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    middle_name = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)

    # Employment Info
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    position = Column(String(100), nullable=True)
    employment_type = Column(String(50), default="regular")  # regular, probationary, contractual
    hire_date = Column(Date, nullable=True)

    # Shift Assignment
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)

    # Payroll Info (Monthly amounts in PHP)
    basic_salary = Column(Numeric(12, 2), default=0)  # Full monthly basic
    daily_rate = Column(Numeric(10, 2), default=0)
    hourly_rate = Column(Numeric(10, 2), default=0)
    allowance = Column(Numeric(10, 2), default=0)  # Monthly allowance
    productivity_incentive = Column(Numeric(10, 2), default=0)  # Monthly productivity incentive
    language_incentive = Column(Numeric(10, 2), default=0)  # Monthly language incentive

    # Government Contributions (adjustable per employee, monthly amounts)
    sss_contribution = Column(Numeric(10, 2), nullable=True)  # SSS employee share
    philhealth_contribution = Column(Numeric(10, 2), nullable=True)  # PhilHealth employee share
    pagibig_contribution = Column(Numeric(10, 2), nullable=True)  # Pag-IBIG employee share
    tax_amount = Column(Numeric(10, 2), nullable=True)  # Withholding tax

    # Payroll Preset - remembered days per cutoff (if set, overrides attendance-based calculation)
    default_days_per_cutoff = Column(Numeric(4, 1), nullable=True)  # e.g., 2.0 for teachers who work 2 days

    # Work hours per day for this employee (used in late/undertime calculation)
    # Default is 8, but can be 6, 4, etc. depending on schedule
    work_hours_per_day = Column(Numeric(4, 2), nullable=True, default=8)  # e.g., 6.0 for part-time

    # Call time / Schedule settings
    call_time = Column(String(5), nullable=True, default="08:00")  # Official call time (HH:MM format)
    time_out = Column(String(5), nullable=True, default="17:00")  # Official time out (HH:MM format)
    buffer_minutes = Column(Integer, nullable=True, default=10)  # Minutes before call time to be in (e.g., 10 = should be in by 7:50 if call time is 8:00)
    is_flexible = Column(Boolean, default=False)  # If true, no lates are calculated for this employee

    # Biometric
    biometric_id = Column(String(50), nullable=True, index=True)  # ID from biometric device

    # Status - using String for SQLite compatibility
    status = Column(String(20), default="pending")  # pending, active, inactive
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    department = relationship("Department", back_populates="employees")
    shift = relationship("Shift", back_populates="employees")
    user = relationship("User", back_populates="employee", uselist=False)
    raw_attendance = relationship("RawAttendanceEvent", back_populates="employee")
    processed_attendance = relationship("ProcessedAttendance", back_populates="employee")
    payslips = relationship("Payslip", back_populates="employee")
    correction_requests = relationship("CorrectionRequest", back_populates="employee")

    @property
    def full_name(self) -> str:
        if self.middle_name:
            return f"{self.first_name} {self.middle_name} {self.last_name}"
        return f"{self.first_name} {self.last_name}"

    def __repr__(self):
        return f"<Employee {self.employee_no}: {self.full_name}>"
