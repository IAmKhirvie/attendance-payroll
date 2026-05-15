"""
Attendance Recalculation Service
================================
Recalculate late minutes for attendance records after schedule changes.
"""

from datetime import datetime, time, timedelta
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models.attendance import ProcessedAttendance, AttendanceStatus
from app.services.attendance_import import parse_call_time


def recalculate_all_late_minutes(
    db: Session,
    employee_id: int = None
) -> Dict[str, Any]:
    """
    Recalculate late_minutes for all attendance records using current employee schedules.

    This is called automatically after:
    - Notion sync (when schedules change)
    - Payroll import (when schedules change)

    Args:
        db: Database session
        employee_id: Optional - recalculate only for this employee

    Returns:
        Dictionary with recalculation results
    """
    # Get attendance records to recalculate
    query = db.query(ProcessedAttendance).filter(
        ProcessedAttendance.time_in.isnot(None),
        ProcessedAttendance.status.in_([AttendanceStatus.COMPLETE, AttendanceStatus.INCOMPLETE])
    )

    if employee_id:
        query = query.filter(ProcessedAttendance.employee_id == employee_id)

    records = query.all()

    updated_count = 0
    total_late_before = 0
    total_late_after = 0
    changes = []

    for record in records:
        employee = record.employee
        if not employee:
            continue

        old_late = record.late_minutes or 0
        total_late_before += old_late

        # Get employee's effective call time (handles flexible schedules)
        effective_call_time = employee.get_effective_call_time()
        buffer_mins = employee.buffer_minutes or 10

        new_late = 0
        try:
            # Parse call time (handles both "08:00" and "08:00 AM" formats)
            call_hour, call_min = parse_call_time(effective_call_time)
            call_time_dt = datetime.combine(record.date, time(call_hour, call_min))
            # Add buffer to call time - employee should arrive by call_time + buffer
            latest_arrival = call_time_dt + timedelta(minutes=buffer_mins)

            if record.time_in > latest_arrival:
                # Employee is late - calculate how many minutes after latest_arrival
                new_late = int((record.time_in - latest_arrival).total_seconds() / 60)

            # Sanity check: late should not exceed work hours (e.g., max 8 hours = 480 mins)
            max_late = (employee.work_hours_per_day or 8) * 60
            if new_late > max_late:
                new_late = 0  # Something's wrong with the calculation, don't mark as late
        except (ValueError, TypeError):
            pass  # Invalid call time format, skip late calculation

        total_late_after += new_late

        # Update record if late minutes changed
        if old_late != new_late:
            # Track changes
            changes.append({
                "employee": employee.full_name,
                "date": record.date.isoformat(),
                "time_in": record.time_in.strftime("%I:%M %p") if record.time_in else None,
                "call_time": effective_call_time,
                "buffer": buffer_mins,
                "old_late": old_late,
                "new_late": new_late
            })

            record.late_minutes = new_late

            # Update exceptions list
            exceptions = record.exceptions or []
            if new_late > 0 and 'late' not in exceptions:
                exceptions.append('late')
            elif new_late == 0 and 'late' in exceptions:
                exceptions.remove('late')
            record.exceptions = exceptions if exceptions else None
            record.has_exception = bool(exceptions) or new_late > 0

            updated_count += 1

    db.commit()

    return {
        "records_checked": len(records),
        "records_updated": updated_count,
        "total_late_before": total_late_before,
        "total_late_after": total_late_after,
        "late_reduction": total_late_before - total_late_after,
        "changes": changes  # Caller decides how many to show
    }
