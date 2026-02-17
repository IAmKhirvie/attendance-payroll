"""
Attendance Models
=================
Shifts, biometric devices, raw punches, and processed attendance.
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Time,
    ForeignKey, Numeric, Text, Enum as SQLEnum, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class Shift(Base):
    """Work shift definition."""
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)

    # Shift times
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    # Break
    break_start = Column(Time, nullable=True)
    break_end = Column(Time, nullable=True)
    break_minutes = Column(Integer, default=60)

    # Grace periods (in minutes)
    grace_period_in = Column(Integer, default=15)  # Late grace
    grace_period_out = Column(Integer, default=0)  # Early out grace

    # Overtime settings
    overtime_start_after_minutes = Column(Integer, default=0)  # OT starts after X mins past end
    overtime_rate_multiplier = Column(Numeric(4, 2), default=1.25)

    # Night differential
    night_diff_start = Column(Time, nullable=True)  # e.g., 22:00
    night_diff_end = Column(Time, nullable=True)  # e.g., 06:00
    night_diff_rate = Column(Numeric(4, 2), default=1.10)

    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employees = relationship("Employee", back_populates="shift")

    def __repr__(self):
        return f"<Shift {self.code}: {self.start_time}-{self.end_time}>"


class BiometricDevice(Base):
    """Biometric device registration."""
    __tablename__ = "biometric_devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    device_type = Column(String(50), default="fingerprint")  # fingerprint, face, card
    location = Column(String(100), nullable=True)

    # Connection (for future polling feature)
    ip_address = Column(String(45), nullable=True)
    port = Column(Integer, nullable=True)

    # Import settings
    file_format = Column(String(20), default="xlsx")  # xlsx, xls, csv
    column_mapping = Column(JSON, nullable=True)  # Saved column mappings

    # Status
    is_active = Column(Boolean, default=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    raw_events = relationship("RawAttendanceEvent", back_populates="device")

    def __repr__(self):
        return f"<BiometricDevice {self.name}>"


class PunchType(str, enum.Enum):
    """Type of attendance punch."""
    IN = "in"
    OUT = "out"
    BREAK_OUT = "break_out"
    BREAK_IN = "break_in"
    UNKNOWN = "unknown"


class RawAttendanceEvent(Base):
    """Raw punch data from biometric devices."""
    __tablename__ = "raw_attendance_events"

    id = Column(Integer, primary_key=True, index=True)

    # Employee identification
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    biometric_id = Column(String(50), nullable=False, index=True)  # ID from device

    # Punch data
    punch_time = Column(DateTime(timezone=True), nullable=False, index=True)
    punch_type = Column(SQLEnum(PunchType), default=PunchType.UNKNOWN)

    # Source tracking
    device_id = Column(Integer, ForeignKey("biometric_devices.id"), nullable=True)
    source_file = Column(String(255), nullable=True)  # Original filename
    import_batch_id = Column(String(50), nullable=True)  # Batch identifier

    # Processing status
    is_processed = Column(Boolean, default=False)
    is_duplicate = Column(Boolean, default=False)

    # Timestamps
    imported_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    employee = relationship("Employee", back_populates="raw_attendance")
    device = relationship("BiometricDevice", back_populates="raw_events")

    def __repr__(self):
        return f"<RawEvent {self.biometric_id} @ {self.punch_time}>"


class AttendanceStatus(str, enum.Enum):
    """Status of processed attendance."""
    COMPLETE = "complete"      # Has IN and OUT
    INCOMPLETE = "incomplete"  # Missing punch
    ABSENT = "absent"          # No punches
    ON_LEAVE = "on_leave"      # Approved leave
    HOLIDAY = "holiday"        # Public holiday
    REST_DAY = "rest_day"      # Scheduled rest day


class ProcessedAttendance(Base):
    """Daily processed attendance record."""
    __tablename__ = "processed_attendance"

    id = Column(Integer, primary_key=True, index=True)

    # Employee & Date
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)

    # Shift used for calculations
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)

    # Actual times
    time_in = Column(DateTime(timezone=True), nullable=True)
    time_out = Column(DateTime(timezone=True), nullable=True)

    # Calculated values (in minutes unless specified)
    worked_minutes = Column(Integer, default=0)
    late_minutes = Column(Integer, default=0)
    undertime_minutes = Column(Integer, default=0)
    overtime_minutes = Column(Integer, default=0)
    night_diff_minutes = Column(Integer, default=0)

    # Break
    break_minutes_taken = Column(Integer, default=0)

    # Status
    status = Column(SQLEnum(AttendanceStatus), default=AttendanceStatus.INCOMPLETE)
    has_exception = Column(Boolean, default=False)

    # Exceptions (JSON array of exception types)
    exceptions = Column(JSON, nullable=True)  # e.g., ["missing_out", "late"]

    # Approval
    is_approved = Column(Boolean, default=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employee = relationship("Employee", back_populates="processed_attendance")
    shift = relationship("Shift")

    def __repr__(self):
        return f"<Attendance {self.employee_id} @ {self.date}: {self.status.value}>"


class CorrectionStatus(str, enum.Enum):
    """Status of correction request."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ImportBatch(Base):
    """Import batch history for tracking file imports."""
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(50), unique=True, nullable=False, index=True)
    filename = Column(String(255), nullable=False)

    # Summary stats
    total_records = Column(Integer, default=0)
    imported = Column(Integer, default=0)
    updated = Column(Integer, default=0)
    skipped = Column(Integer, default=0)
    employees_found = Column(Integer, default=0)

    # Date range of imported data
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)

    # Who imported
    imported_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    records = relationship("ImportRecord", back_populates="batch", cascade="all, delete-orphan")
    user = relationship("User")

    def __repr__(self):
        return f"<ImportBatch {self.batch_id}: {self.filename}>"


class ImportRecord(Base):
    """Individual record from an import batch."""
    __tablename__ = "import_records"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=False, index=True)

    # Employee info (as imported)
    employee_name = Column(String(200), nullable=False)
    employee_biometric_id = Column(String(50), nullable=True)

    # Attendance data
    date = Column(Date, nullable=False)
    day_name = Column(String(10), nullable=True)
    time_in = Column(String(20), nullable=True)
    time_out = Column(String(20), nullable=True)
    worked_minutes = Column(Integer, default=0)
    daily_total_hours = Column(Numeric(5, 2), default=0)
    note = Column(Text, nullable=True)
    status = Column(String(20), nullable=True)
    exceptions = Column(JSON, nullable=True)
    has_exception = Column(Boolean, default=False)

    # Relationships
    batch = relationship("ImportBatch", back_populates="records")

    def __repr__(self):
        return f"<ImportRecord {self.employee_name} @ {self.date}>"


class CorrectionRequest(Base):
    """Employee request to correct attendance."""
    __tablename__ = "correction_requests"

    id = Column(Integer, primary_key=True, index=True)

    # Employee & Attendance
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    attendance_id = Column(Integer, ForeignKey("processed_attendance.id"), nullable=False)

    # Requested changes
    requested_time_in = Column(DateTime(timezone=True), nullable=True)
    requested_time_out = Column(DateTime(timezone=True), nullable=True)
    reason = Column(Text, nullable=False)

    # Status
    status = Column(SQLEnum(CorrectionStatus), default=CorrectionStatus.PENDING)

    # Approval
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employee = relationship("Employee", back_populates="correction_requests")
    attendance = relationship("ProcessedAttendance")

    def __repr__(self):
        return f"<CorrectionRequest {self.id}: {self.status.value}>"
