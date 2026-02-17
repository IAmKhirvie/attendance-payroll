"""
Attendance Schemas
==================
Pydantic models for attendance-related API operations.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import date, time, datetime
from decimal import Decimal
from app.models.attendance import AttendanceStatus, PunchType, CorrectionStatus


# === Shift ===

class ShiftBase(BaseModel):
    """Base shift schema."""
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=20)
    start_time: time
    end_time: time


class ShiftCreate(ShiftBase):
    """Create shift request."""
    break_start: Optional[time] = None
    break_end: Optional[time] = None
    break_minutes: int = 60
    grace_period_in: int = 15
    grace_period_out: int = 0
    overtime_start_after_minutes: int = 0
    overtime_rate_multiplier: Decimal = Decimal("1.25")
    night_diff_start: Optional[time] = None
    night_diff_end: Optional[time] = None
    night_diff_rate: Decimal = Decimal("1.10")


class ShiftUpdate(BaseModel):
    """Update shift request."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_start: Optional[time] = None
    break_end: Optional[time] = None
    break_minutes: Optional[int] = None
    grace_period_in: Optional[int] = None
    grace_period_out: Optional[int] = None
    overtime_start_after_minutes: Optional[int] = None
    overtime_rate_multiplier: Optional[Decimal] = None
    night_diff_start: Optional[time] = None
    night_diff_end: Optional[time] = None
    night_diff_rate: Optional[Decimal] = None
    is_active: Optional[bool] = None


class ShiftResponse(ShiftBase):
    """Shift response."""
    id: int
    break_start: Optional[time]
    break_end: Optional[time]
    break_minutes: int
    grace_period_in: int
    grace_period_out: int
    overtime_start_after_minutes: int
    overtime_rate_multiplier: Decimal
    night_diff_start: Optional[time]
    night_diff_end: Optional[time]
    night_diff_rate: Decimal
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# === Biometric Device ===

class DeviceCreate(BaseModel):
    """Create device request."""
    name: str = Field(..., min_length=1, max_length=100)
    device_type: str = "fingerprint"
    location: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    file_format: str = "xlsx"


class DeviceResponse(BaseModel):
    """Device response."""
    id: int
    name: str
    device_type: str
    location: Optional[str]
    ip_address: Optional[str]
    port: Optional[int]
    file_format: str
    column_mapping: Optional[dict]
    is_active: bool
    last_sync_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# === Import ===

class ImportColumnMapping(BaseModel):
    """Column mapping for file import."""
    biometric_id_column: str
    datetime_column: str
    date_column: Optional[str] = None
    time_column: Optional[str] = None
    punch_type_column: Optional[str] = None
    header_row: int = 0
    date_format: str = "%Y-%m-%d"
    time_format: str = "%H:%M:%S"
    datetime_format: str = "%Y-%m-%d %H:%M:%S"


class ImportResult(BaseModel):
    """Result of attendance import."""
    success: bool
    total_rows: int
    imported: int
    duplicates: int
    errors: int
    error_details: List[str] = []
    batch_id: str


# === Processed Attendance ===

class AttendanceResponse(BaseModel):
    """Processed attendance response."""
    id: int
    employee_id: int
    employee_name: str
    employee_no: str
    date: date
    shift_id: Optional[int]
    shift_name: Optional[str]
    time_in: Optional[datetime]
    time_out: Optional[datetime]
    worked_minutes: int
    late_minutes: int
    undertime_minutes: int
    overtime_minutes: int
    night_diff_minutes: int
    status: AttendanceStatus
    has_exception: bool
    exceptions: Optional[List[str]]
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AttendanceEditRequest(BaseModel):
    """Edit attendance request (by HR)."""
    time_in: Optional[datetime] = None
    time_out: Optional[datetime] = None
    reason: str = Field(..., min_length=1)


class AttendanceDailySummary(BaseModel):
    """Daily attendance summary."""
    date: date
    total_employees: int
    present: int
    absent: int
    late: int
    with_exceptions: int


# === Correction Request ===

class CorrectionRequestCreate(BaseModel):
    """Create correction request (by employee)."""
    attendance_id: int
    requested_time_in: Optional[datetime] = None
    requested_time_out: Optional[datetime] = None
    reason: str = Field(..., min_length=1)


class CorrectionRequestResponse(BaseModel):
    """Correction request response."""
    id: int
    employee_id: int
    employee_name: str
    attendance_id: int
    attendance_date: date
    requested_time_in: Optional[datetime]
    requested_time_out: Optional[datetime]
    reason: str
    status: CorrectionStatus
    reviewed_by: Optional[int]
    reviewed_at: Optional[datetime]
    review_notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class CorrectionReviewRequest(BaseModel):
    """Review (approve/reject) correction request."""
    approved: bool
    notes: Optional[str] = None
