"""
Attendance Import Service
=========================
Parse and import attendance data from time report files.
Auto-creates employees from import data.
Auto-fixes duplicate and misaligned time entries from machine errors.

Known machine errors:
1. Duplicate time_in - Employee presses time_in twice (forgot to press time_out)
2. Misaligned rows - Time_out appears on a SEPARATE ROW with NO DATE
   Example:
     Row 158: MON, 01/12/2026, 07:37 AM, (empty), "Missing OUT"
     Row 159: (empty), (empty), (empty), 09:12 PM, "Missing IN"
   The time_out in row 159 belongs to row 158.
"""

import pandas as pd
from datetime import datetime, date, time, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
import re
import uuid

from app.models.attendance import ProcessedAttendance, AttendanceStatus
from app.models.employee import Employee


class TimeReportParser:
    """Parser for NGTimereport format with auto-fix for machine errors."""

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.df = None
        self.employees_data = []

    def parse(self) -> List[Dict[str, Any]]:
        """Parse the time report file and return structured data."""
        # Read Excel file
        self.df = pd.read_excel(self.file_path)

        # Find all employee sections
        employee_rows = self.df[self.df.iloc[:, 0] == 'Employee'].index.tolist()

        all_records = []

        for i, emp_idx in enumerate(employee_rows):
            # Get employee name and ID
            emp_info = self.df.iloc[emp_idx, 3]
            emp_name, emp_id = self._parse_employee_info(emp_info)

            # Find the end of this employee's section
            next_emp_idx = employee_rows[i + 1] if i + 1 < len(employee_rows) else len(self.df)

            # Parse all rows for this employee, including rows without dates
            employee_records = self._parse_employee_section(emp_idx, next_emp_idx, emp_name, emp_id)
            all_records.extend(employee_records)

        # Post-process to fix any remaining duplicates on the same date
        all_records = self._fix_duplicate_entries(all_records)

        return all_records

    def _parse_employee_info(self, emp_info: str) -> Tuple[str, Optional[str]]:
        """Extract employee name and ID from string like 'Gemma Termulo (1)'."""
        if pd.isna(emp_info):
            return "Unknown", None

        emp_info = str(emp_info)
        match = re.match(r'^(.+?)\s*\((\d+)\)$', emp_info)
        if match:
            return match.group(1).strip(), match.group(2)
        return emp_info.strip(), None

    def _parse_employee_section(self, emp_idx: int, next_emp_idx: int, emp_name: str, emp_id: str) -> List[Dict[str, Any]]:
        """
        Parse all attendance rows for one employee, handling misaligned rows.

        The key insight: when time_out is on a separate row (with no date),
        we need to merge it with the previous row that has the date.
        """
        day_names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
        records = []
        pending_record = None  # Track record waiting for time_out

        for row_idx in range(emp_idx + 2, next_emp_idx):
            row = self.df.iloc[row_idx]

            day_name = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ''
            date_str = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ''
            time_in_str = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else ''
            time_out_str = str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else ''
            work_time = row.iloc[4] if pd.notna(row.iloc[4]) else None
            daily_total = row.iloc[5] if pd.notna(row.iloc[5]) else None
            note = str(row.iloc[6]).strip() if pd.notna(row.iloc[6]) else ''

            # Parse times
            time_in = self._parse_time(time_in_str)
            time_out = self._parse_time(time_out_str)

            # Case 1: Row with a valid date (normal attendance row)
            if day_name in day_names and date_str and date_str != 'nan':
                # First, save any pending record
                if pending_record:
                    records.append(pending_record)
                    pending_record = None

                # Parse the date
                try:
                    record_date = datetime.strptime(date_str, '%m/%d/%Y').date()
                except ValueError:
                    continue

                # Detect issues from notes
                has_missing_out = 'Missing OUT' in note

                # Calculate hours from time_in and time_out (not from XLS)
                # Format: hours.minutes (e.g., 13 hours 35 minutes = 13.35)
                worked_minutes = 0
                calculated_hours = 0.0
                if time_in and time_out:
                    time_in_dt = datetime.combine(record_date, time_in)
                    time_out_dt = datetime.combine(record_date, time_out)
                    # Handle overnight shifts
                    if time_out_dt < time_in_dt:
                        time_out_dt += timedelta(days=1)
                    diff = time_out_dt - time_in_dt
                    worked_minutes = int(diff.total_seconds() / 60)
                    # Format as hours.minutes (not decimal hours)
                    hours = worked_minutes // 60
                    mins = worked_minutes % 60
                    calculated_hours = float(f"{hours}.{mins:02d}")

                record = {
                    'employee_name': emp_name,
                    'employee_biometric_id': emp_id,
                    'date': record_date,
                    'day_name': day_name,
                    'time_in': time_in,
                    'time_out': time_out,
                    'worked_minutes': worked_minutes,
                    'daily_total_hours': calculated_hours,
                    'note': note,
                    'status': 'complete' if time_in and time_out else ('incomplete' if time_in or time_out else ('rest_day' if day_name in ['SUN', 'SAT'] else 'absent')),
                    'exceptions': [],
                    'has_exception': False,
                    'auto_fixed': [],
                    'row_idx': row_idx
                }

                # If this row has time_in but missing time_out, keep it pending
                # to potentially merge with the next row's time_out
                if time_in and not time_out and has_missing_out:
                    pending_record = record
                else:
                    # Check for duplicate time (time_in == time_out)
                    if time_in and time_out and time_in == time_out:
                        record['time_out'] = None
                        record['status'] = 'incomplete'
                        record['exceptions'] = ['missing_out']
                        record['has_exception'] = True
                        record['auto_fixed'] = ['duplicate_time_cleared']

                    records.append(record)

            # Case 2: Row WITHOUT a date but WITH time_out (misaligned time_out)
            elif not day_name and (not date_str or date_str == 'nan') and time_out and 'Missing IN' in note:
                # This time_out belongs to the pending record!
                if pending_record:
                    pending_record['time_out'] = time_out
                    pending_record['status'] = 'complete'
                    pending_record['exceptions'] = []
                    pending_record['has_exception'] = False
                    pending_record['auto_fixed'] = ['merged_misaligned_timeout']
                    pending_record['note'] = ''  # Clear note since it's fixed

                    # Recalculate hours from time_in and time_out
                    if pending_record['time_in'] and time_out:
                        time_in_dt = datetime.combine(pending_record['date'], pending_record['time_in'])
                        time_out_dt = datetime.combine(pending_record['date'], time_out)
                        if time_out_dt < time_in_dt:
                            time_out_dt += timedelta(days=1)
                        diff = time_out_dt - time_in_dt
                        pending_record['worked_minutes'] = int(diff.total_seconds() / 60)
                        # Format as hours.minutes (not decimal hours)
                        hours = pending_record['worked_minutes'] // 60
                        mins = pending_record['worked_minutes'] % 60
                        pending_record['daily_total_hours'] = float(f"{hours}.{mins:02d}")

                    records.append(pending_record)
                    pending_record = None
                # else: orphan time_out row, skip it

        # Don't forget the last pending record
        if pending_record:
            pending_record['exceptions'] = ['missing_out']
            pending_record['has_exception'] = True
            records.append(pending_record)

        return records

    def _fix_duplicate_entries(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Post-process to fix duplicate entries for the same employee on the same day.

        This handles the case where:
        - Employee presses time_in in the morning
        - Employee forgets to press time_out, presses time_in again in the afternoon
        - Result: Two time_in entries for the same day

        Fix: Use earliest time_in as IN, latest time as OUT
        """
        # Group records by employee+date
        grouped = {}
        for record in records:
            key = (record['employee_name'], record['employee_biometric_id'], record['date'])
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(record)

        fixed_records = []

        for key, group in grouped.items():
            if len(group) == 1:
                fixed_records.append(group[0])
            else:
                merged = self._merge_duplicate_records(group)
                fixed_records.append(merged)

        return fixed_records

    def _merge_duplicate_records(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Merge multiple records for the same employee+date.
        Use earliest time as time_in, latest time as time_out.
        """
        merged = records[0].copy()
        merged['auto_fixed'] = merged.get('auto_fixed', []) + ['merged_duplicates']

        # Collect all times
        all_times = []
        for record in records:
            if record['time_in']:
                all_times.append(record['time_in'])
            if record['time_out']:
                all_times.append(record['time_out'])

        if not all_times:
            return merged

        # Sort by time
        all_times.sort(key=lambda t: (t.hour, t.minute))

        earliest = all_times[0]
        latest = all_times[-1]

        if earliest != latest:
            merged['time_in'] = earliest
            merged['time_out'] = latest
            merged['status'] = 'complete'
            merged['exceptions'] = []
            merged['has_exception'] = False
            merged['note'] = ''  # Clear note since it's fixed
            merged['auto_fixed'].append('used_earliest_latest')

            # Recalculate hours from merged time_in and time_out
            time_in_dt = datetime.combine(merged['date'], earliest)
            time_out_dt = datetime.combine(merged['date'], latest)
            if time_out_dt < time_in_dt:
                time_out_dt += timedelta(days=1)
            diff = time_out_dt - time_in_dt
            merged['worked_minutes'] = int(diff.total_seconds() / 60)
            # Format as hours.minutes (not decimal hours)
            hours = merged['worked_minutes'] // 60
            mins = merged['worked_minutes'] % 60
            merged['daily_total_hours'] = float(f"{hours}.{mins:02d}")
        else:
            merged['time_in'] = earliest
            merged['time_out'] = None
            merged['status'] = 'incomplete'
            merged['exceptions'] = ['missing_out']
            merged['has_exception'] = True
            merged['worked_minutes'] = 0
            merged['daily_total_hours'] = 0.0

        return merged

    def _parse_time(self, time_str: str) -> Optional[time]:
        """Parse time string like '10:36 AM' to time object."""
        if not time_str or time_str == 'nan' or time_str == 'None':
            return None

        time_str = time_str.strip()
        formats = ['%I:%M %p', '%H:%M:%S', '%H:%M', '%I:%M%p']

        for fmt in formats:
            try:
                return datetime.strptime(time_str, fmt).time()
            except ValueError:
                continue

        return None


def normalize_name(name: str) -> str:
    """Normalize a name for comparison (lowercase, trim spaces)."""
    return ' '.join(name.lower().split())


def find_employee_by_name(db: Session, name: str) -> Optional[Employee]:
    """Find employee by name with fuzzy matching."""
    normalized = normalize_name(name)
    name_parts = normalized.split()

    if len(name_parts) < 2:
        return db.query(Employee).filter(
            func.lower(Employee.first_name) == normalized
        ).first()

    first_name = name_parts[0]
    last_name = name_parts[-1]

    employee = db.query(Employee).filter(
        func.lower(Employee.first_name) == first_name,
        func.lower(Employee.last_name) == last_name
    ).first()

    if employee:
        return employee

    if len(name_parts) > 2:
        middle_name = ' '.join(name_parts[1:-1])
        employee = db.query(Employee).filter(
            func.lower(Employee.first_name) == first_name,
            func.lower(Employee.middle_name) == middle_name,
            func.lower(Employee.last_name) == last_name
        ).first()
        if employee:
            return employee

    all_employees = db.query(Employee).all()
    for emp in all_employees:
        emp_full = normalize_name(emp.full_name)
        if emp_full == normalized:
            return emp

    return None


def import_time_report(
    db: Session,
    file_path: str,
    create_employees: bool = True
) -> Dict[str, Any]:
    """
    Import attendance data from a time report file.
    Automatically creates employees and fixes misaligned time entries.
    """
    parser = TimeReportParser(file_path)
    records = parser.parse()

    import_batch_id = str(uuid.uuid4())[:8]

    imported = 0
    updated = 0
    skipped = 0
    auto_fixed_count = 0
    employees_created = 0
    employees_existing = 0
    errors = []
    employee_map = {}

    # Count auto-fixed records
    for r in records:
        if r.get('auto_fixed'):
            auto_fixed_count += 1

    # Get unique employees
    unique_employees = {}
    for r in records:
        key = (r['employee_name'], r['employee_biometric_id'])
        if key not in unique_employees:
            unique_employees[key] = r['employee_name']

    # Process each unique employee
    for (emp_name, bio_id), name in unique_employees.items():
        employee = None

        if bio_id:
            employee = db.query(Employee).filter(Employee.biometric_id == bio_id).first()

        if not employee:
            employee = find_employee_by_name(db, emp_name)

        if employee:
            employee_map[(emp_name, bio_id)] = employee
            employees_existing += 1

            if bio_id and not employee.biometric_id:
                employee.biometric_id = bio_id
        else:
            name_parts = emp_name.split()
            first_name = name_parts[0] if name_parts else emp_name
            last_name = name_parts[-1] if len(name_parts) > 1 else ''
            middle_name = ' '.join(name_parts[1:-1]) if len(name_parts) > 2 else None

            emp_count = db.query(Employee).count()
            employee_no = f"EMP{emp_count + 1:04d}"

            while db.query(Employee).filter(Employee.employee_no == employee_no).first():
                emp_count += 1
                employee_no = f"EMP{emp_count + 1:04d}"

            new_employee = Employee(
                employee_no=employee_no,
                first_name=first_name,
                middle_name=middle_name,
                last_name=last_name,
                biometric_id=bio_id,
                employment_type='regular',
                status='pending',
                is_active=True
            )
            db.add(new_employee)
            db.flush()

            employee_map[(emp_name, bio_id)] = new_employee
            employees_created += 1

    # Process attendance records
    for record in records:
        emp_key = (record['employee_name'], record['employee_biometric_id'])
        employee = employee_map.get(emp_key)

        if not employee:
            skipped += 1
            continue

        existing = db.query(ProcessedAttendance).filter(
            ProcessedAttendance.employee_id == employee.id,
            ProcessedAttendance.date == record['date']
        ).first()

        time_in_dt = None
        time_out_dt = None

        if record['time_in']:
            time_in_dt = datetime.combine(record['date'], record['time_in'])
        if record['time_out']:
            time_out_dt = datetime.combine(record['date'], record['time_out'])

        status_map = {
            'complete': AttendanceStatus.COMPLETE,
            'incomplete': AttendanceStatus.INCOMPLETE,
            'absent': AttendanceStatus.ABSENT,
            'rest_day': AttendanceStatus.REST_DAY
        }
        status = status_map.get(record['status'], AttendanceStatus.INCOMPLETE)

        exceptions = record.get('exceptions', [])
        if record.get('auto_fixed'):
            for fix in record['auto_fixed']:
                if fix not in exceptions:
                    exceptions.append(f'auto_fixed:{fix}')

        if existing:
            existing.time_in = time_in_dt
            existing.time_out = time_out_dt
            existing.worked_minutes = record['worked_minutes']
            existing.status = status
            existing.has_exception = record['has_exception']
            existing.exceptions = exceptions if exceptions else None
            updated += 1
        else:
            attendance = ProcessedAttendance(
                employee_id=employee.id,
                date=record['date'],
                time_in=time_in_dt,
                time_out=time_out_dt,
                worked_minutes=record['worked_minutes'],
                status=status,
                has_exception=record['has_exception'],
                exceptions=exceptions if exceptions else None
            )
            db.add(attendance)
            imported += 1

    db.commit()

    return {
        'batch_id': import_batch_id,
        'total_records': len(records),
        'imported': imported,
        'updated': updated,
        'skipped': skipped,
        'auto_fixed': auto_fixed_count,
        'errors': errors,
        'employees_found': len(employee_map),
        'employees_created': employees_created,
        'employees_existing': employees_existing,
        'records': records
    }
