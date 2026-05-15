"""
Attendance Import Service
=========================
Parse and import attendance data from time report files.
Auto-creates employees from import data.
Auto-fixes duplicate and misaligned time entries from machine errors.

Known machine errors:
1. Duplicate time_in - Employee presses time_in twice (forgot to press time_out)

2. Misaligned rows (Pattern A) - Time_out in OUT column with "Missing IN"
   Example:
     Row 158: MON, 01/12/2026, 07:37 AM, (empty), "Missing OUT"
     Row 159: (empty), (empty), (empty), 09:12 PM, "Missing IN"
   The time_out in row 159 (OUT column) belongs to row 158.

3. Misaligned rows (Pattern B) - Time_out in IN column with "Missing OUT"
   Example:
     Row 77: THU, 02/26/2026, 12:51 PM, (empty), "Missing OUT"
     Row 78: (empty), (empty), 09:05 PM, (empty), "Missing OUT"
   The time in row 78 (IN column) is actually the time_out for row 77.
   This happens when employee presses IN button again instead of OUT.
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


def parse_call_time(time_str: str) -> Tuple[int, int]:
    """
    Parse call time string to (hour, minute) in 24-hour format.
    Handles both formats:
    - 24-hour: "08:00", "17:00", "13:30"
    - 12-hour: "08:00 AM", "01:00 PM", "5:30 PM"

    Returns (hour, minute) tuple in 24-hour format.
    """
    if not time_str:
        return (8, 0)  # Default to 8 AM

    time_str = time_str.strip()

    # Check for 12-hour format (contains AM/PM)
    match_12 = re.match(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', time_str, re.IGNORECASE)
    if match_12:
        hour = int(match_12.group(1))
        minute = int(match_12.group(2))
        ampm = match_12.group(3).upper()

        # Convert to 24-hour
        if ampm == 'PM' and hour != 12:
            hour += 12
        elif ampm == 'AM' and hour == 12:
            hour = 0

        return (hour, minute)

    # Try 24-hour format
    match_24 = re.match(r'^(\d{1,2}):(\d{2})$', time_str)
    if match_24:
        return (int(match_24.group(1)), int(match_24.group(2)))

    # Try just hour (e.g., "08:00" stored as "8")
    try:
        hour = int(time_str)
        return (hour, 0)
    except ValueError:
        pass

    # Default fallback
    return (8, 0)


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

    def _parse_date(self, date_value: Any) -> Optional[date]:
        """Parse NGTimereport date values across export variants."""
        if date_value is None or pd.isna(date_value):
            return None

        if isinstance(date_value, datetime):
            return date_value.date()
        if isinstance(date_value, date):
            return date_value

        date_str = str(date_value).strip()
        if not date_str or date_str == 'nan':
            return None

        for fmt in ('%m/%d/%Y', '%m-%d-%Y', '%Y-%m-%d'):
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue

        return None

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
            date_value = row.iloc[1] if pd.notna(row.iloc[1]) else None
            date_str = str(date_value).strip() if date_value is not None else ''
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
                record_date = self._parse_date(date_value)
                if not record_date:
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

                # Status determination - don't assume weekend is rest day
                # The employee's working days schedule will determine this later
                if time_in and time_out:
                    initial_status = 'complete'
                elif time_in or time_out:
                    initial_status = 'incomplete'
                else:
                    # No attendance - will be determined as rest_day or absent based on employee schedule
                    initial_status = 'no_attendance'

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
                    'status': initial_status,
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

            # Case 2: Row WITHOUT a date but WITH time_out in OUT column (misaligned time_out)
            # Pattern: time_out is in the OUT column with "Missing IN" note
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

            # Case 3: Row WITHOUT a date but WITH time in IN column (misaligned time_out variant)
            # Pattern: time_out appears in the IN column with "Missing OUT" note
            # This happens when employee presses IN again instead of OUT
            elif not day_name and (not date_str or date_str == 'nan') and time_in and not time_out and 'Missing OUT' in note:
                # This time_in is actually the time_out for the pending record!
                if pending_record:
                    pending_record['time_out'] = time_in  # Use time_in as time_out
                    pending_record['status'] = 'complete'
                    pending_record['exceptions'] = []
                    pending_record['has_exception'] = False
                    pending_record['auto_fixed'] = ['merged_misaligned_timeout_from_in_column']
                    pending_record['note'] = ''  # Clear note since it's fixed

                    # Recalculate hours from time_in and time_out
                    if pending_record['time_in'] and time_in:
                        time_in_dt = datetime.combine(pending_record['date'], pending_record['time_in'])
                        time_out_dt = datetime.combine(pending_record['date'], time_in)
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
                # else: orphan row, skip it

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
        """
        Parse time string like '10:36 AM' to time object.

        BIOMETRIC CLOCK OFFSET FIX:
        The biometric machine clock is 1 minute behind real time.
        We add 1 minute to all parsed times to correct this offset.
        Example: Machine shows 7:49 AM but actual time was 7:50 AM
        """
        if not time_str or time_str == 'nan' or time_str == 'None':
            return None

        time_str = time_str.strip()
        formats = ['%I:%M %p', '%H:%M:%S', '%H:%M', '%I:%M%p']

        for fmt in formats:
            try:
                parsed_dt = datetime.strptime(time_str, fmt)
                # Add 1 minute to correct biometric clock offset
                corrected_dt = parsed_dt + timedelta(minutes=1)
                return corrected_dt.time()
            except ValueError:
                continue

        return None


def normalize_name(name: str) -> str:
    """Normalize a name for comparison (lowercase, trim spaces, handle special chars)."""
    import unicodedata
    # Lowercase and trim
    name = ' '.join(name.lower().split())
    # Replace ñ with n
    name = name.replace('ñ', 'n')
    # Remove accents (é -> e, etc)
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    return name


# Common Filipino nickname to full name mappings
NICKNAME_MAPPINGS = {
    # Common nicknames
    'greg': ['griego', 'gregorio', 'gregory'],
    'lyn': ['evelyn', 'marilyn', 'roselyn', 'jocelyn', 'frezilyn'],
    'joy': ['joyce', 'joylyn', 'joylene'],
    'mae': ['may', 'maybelle', 'maylene'],
    'cha': ['charlene', 'charito', 'charmaine'],
    'che': ['rachel', 'michelle'],
    'nel': ['nelly', 'nelson', 'manuel'],
    'jun': ['junior', 'junel'],
    'boy': ['robert', 'roberto'],
    'baby': ['barbara', 'beatriz'],
    'len': ['lenny', 'lenlen', 'helen', 'ellen'],
    'beth': ['elizabeth', 'bethany'],
    'tina': ['christine', 'christina', 'kristina', 'valentina'],
    'chris': ['christine', 'christopher', 'christian', 'cristina'],
    'ine': ['janine', 'christine', 'nadine'],
    'rose': ['rosalie', 'rosalyn', 'rosemarie'],
    'jean': ['jeanette', 'jeanine'],
    'anne': ['annabelle', 'marianne'],
    'belle': ['annabelle', 'isabelle', 'maybelle'],
    'yusi': ['eusebio', 'eusebia'],  # Filipino name
}


def clean_ngt_name(name: str) -> str:
    """
    Clean weird name formats from NGT biometric device.
    Handles reversed names like "Lastname. Firstname" or "Lastname, Firstname".
    """
    name = name.strip()

    # Handle "Lastname. Firstname" format (note the period)
    if '. ' in name:
        parts = name.split('. ', 1)
        if len(parts) == 2:
            # Swap: "Bona. Jean May" -> "Jean May Bona"
            return f"{parts[1]} {parts[0]}"

    # Handle "Lastname, Firstname" format
    if ', ' in name:
        parts = name.split(', ', 1)
        if len(parts) == 2:
            return f"{parts[1]} {parts[0]}"

    return name


def get_name_variations(name_part: str) -> List[str]:
    """Get variations of a name part including nicknames."""
    variations = [name_part]

    # Add nickname mappings
    name_lower = name_part.lower()
    if name_lower in NICKNAME_MAPPINGS:
        variations.extend(NICKNAME_MAPPINGS[name_lower])

    # Also check if this name is a target of a nickname
    for nickname, full_names in NICKNAME_MAPPINGS.items():
        if name_lower in full_names:
            variations.append(nickname)

    return variations


def find_employee_by_name(db: Session, name: str) -> Optional[Employee]:
    """
    Find employee by name with fuzzy matching.
    Prioritizes employees with salary data (basic_salary > 0).
    Handles NGT biometric weird formats and nickname matching.
    """
    # First clean the name (handle reversed formats from NGT)
    cleaned_name = clean_ngt_name(name)
    normalized = normalize_name(cleaned_name)
    name_parts = normalized.split()

    if not name_parts:
        return None

    # Get all employees, prioritize those with salary and ICN numbers (from Notion)
    all_employees = db.query(Employee).order_by(
        # Prioritize ICN employees (from Notion) over EMP (auto-generated)
        Employee.employee_no.asc(),
        Employee.basic_salary.desc().nulls_last()
    ).all()

    # Separate ICN employees (canonical source from Notion)
    icn_employees = [e for e in all_employees if e.employee_no and e.employee_no.startswith('ICN')]
    # Check ICN employees first, then others
    prioritized_employees = icn_employees + [e for e in all_employees if e not in icn_employees]

    last_name = name_parts[-1]
    first_name = name_parts[0] if name_parts else ''

    # Strategy 1: Exact full name match
    for emp in prioritized_employees:
        emp_full = normalize_name(emp.full_name)
        if emp_full == normalized:
            return emp

    # Strategy 2: All input name parts found in employee's full name + same last name
    for emp in prioritized_employees:
        emp_full = normalize_name(emp.full_name)
        emp_full_nospace = emp_full.replace(' ', '')
        emp_last = normalize_name(emp.last_name) if emp.last_name else ''

        # Check last name (also try without spaces for "De Jesus" vs "Dejesus")
        last_name_match = (emp_last == last_name or
                          emp_last.replace(' ', '') == last_name or
                          emp_last == last_name.replace(' ', ''))

        if not last_name_match:
            continue

        # Check if all input parts are in the full name (also check without spaces)
        all_parts_found = all(part in emp_full or part in emp_full_nospace for part in name_parts)
        if all_parts_found:
            return emp

    # Strategy 3: First name + last name match (exact)
    if len(name_parts) >= 2:
        for emp in prioritized_employees:
            emp_first = normalize_name(emp.first_name) if emp.first_name else ''
            emp_last = normalize_name(emp.last_name) if emp.last_name else ''
            if emp_first == first_name and emp_last == last_name:
                return emp

    # Strategy 4: First name is substring of DB first name + last name match
    if len(name_parts) >= 2:
        for emp in prioritized_employees:
            emp_first = normalize_name(emp.first_name) if emp.first_name else ''
            emp_first_nospace = emp_first.replace(' ', '')
            emp_middle = normalize_name(emp.middle_name) if emp.middle_name else ''
            emp_last = normalize_name(emp.last_name) if emp.last_name else ''

            # Check last name match (with space variations)
            last_match = (emp_last == last_name or
                         emp_last.replace(' ', '') == last_name or
                         emp_last == last_name.replace(' ', ''))

            if not last_match:
                continue

            # Check if first name is substring (e.g., "greg" in "griego")
            first_match = (first_name in emp_first or
                          first_name in emp_first_nospace or
                          emp_first.startswith(first_name) or
                          # Also check middle name
                          first_name in emp_middle or
                          emp_middle.startswith(first_name))

            if first_match:
                return emp

    # Strategy 5: Nickname matching - check if input name matches a nickname/variation
    if len(name_parts) >= 2:
        first_variations = get_name_variations(first_name)

        for emp in prioritized_employees:
            emp_first = normalize_name(emp.first_name) if emp.first_name else ''
            emp_middle = normalize_name(emp.middle_name) if emp.middle_name else ''
            emp_last = normalize_name(emp.last_name) if emp.last_name else ''
            emp_full = normalize_name(emp.full_name)

            # Check last name match
            last_match = (emp_last == last_name or
                         emp_last.replace(' ', '') == last_name or
                         emp_last == last_name.replace(' ', ''))

            if not last_match:
                continue

            # Check if any variation of first name matches
            for variation in first_variations:
                if (variation in emp_first or
                    variation in emp_middle or
                    variation in emp_full or
                    emp_first.startswith(variation) or
                    emp_middle.startswith(variation)):
                    return emp

    # Strategy 6: Last name only match (if only one employee with that last name)
    matching_last = [emp for emp in prioritized_employees
                     if normalize_name(emp.last_name or '') == last_name or
                        normalize_name(emp.last_name or '').replace(' ', '') == last_name]
    if len(matching_last) == 1:
        return matching_last[0]

    # Strategy 7: Try with swapped first/last name (in case name order is wrong)
    if len(name_parts) >= 2:
        swapped_first = last_name
        swapped_last = first_name

        for emp in prioritized_employees:
            emp_first = normalize_name(emp.first_name) if emp.first_name else ''
            emp_last = normalize_name(emp.last_name) if emp.last_name else ''

            if emp_last == swapped_last and swapped_first in emp_first:
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

    Employee matching: By NAME only (fuzzy matching).
    Creates new employee only if no name match found.
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

    # Process each unique employee - match by NAME only
    for (emp_name, bio_id), name in unique_employees.items():
        employee = None

        # Match by name (fuzzy matching)
        employee = find_employee_by_name(db, emp_name)

        if employee:
            # Update biometric_id if provided (for reference only)
            if bio_id and not employee.biometric_id:
                employee.biometric_id = str(bio_id)
            employee_map[(emp_name, bio_id)] = employee
            employees_existing += 1
        else:
            # 3. No match found - create new employee
            # First clean the name format (handle reversed NGT names)
            cleaned_name = clean_ngt_name(emp_name)
            name_parts = cleaned_name.split()
            first_name = name_parts[0] if name_parts else cleaned_name
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

            # Add warning about potential duplicate
            errors.append(f"WARNING: New employee created '{first_name} {last_name}' ({employee_no}) from NGT name '{emp_name}'. Please verify this is not a duplicate.")

    # Build holidays lookup for the import date range
    holidays_lookup = {}
    if records:
        from app.models.holiday import Holiday
        all_dates = [r['date'] for r in records if r.get('date')]
        if all_dates:
            min_date = min(all_dates)
            max_date = max(all_dates)
            holidays = db.query(Holiday).filter(
                Holiday.date >= min_date,
                Holiday.date <= max_date,
                Holiday.is_active == True
            ).all()
            for h in holidays:
                holidays_lookup[h.date] = {
                    'type': h.holiday_type.value if h.holiday_type else 'special',
                    'name': h.name,
                }

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

        # Determine status based on employee's working days schedule
        record_status = record['status']

        if record_status == 'no_attendance':
            # Check if employee works on this day
            day_name = record['day_name']  # MON, TUE, WED, THU, FRI, SAT, SUN
            works_today = employee.works_on_day(day_name)

            if works_today:
                # Employee should have worked but didn't - absent
                record_status = 'absent'
            else:
                # Employee doesn't work this day - rest day
                record_status = 'rest_day'

        # Check if this date is a holiday
        is_holiday = False
        holiday_type = None
        holiday_name = None
        if holidays_lookup and record['date'] in holidays_lookup:
            h = holidays_lookup[record['date']]
            is_holiday = True
            holiday_type = h['type']
            holiday_name = h['name']
            # If no attendance on a holiday, mark as HOLIDAY (not absent)
            if record_status == 'absent':
                record_status = 'holiday'

        status_map = {
            'complete': AttendanceStatus.COMPLETE,
            'incomplete': AttendanceStatus.INCOMPLETE,
            'absent': AttendanceStatus.ABSENT,
            'rest_day': AttendanceStatus.REST_DAY,
            'holiday': AttendanceStatus.HOLIDAY,
        }
        status = status_map.get(record_status, AttendanceStatus.INCOMPLETE)

        # Calculate late minutes based on employee's schedule
        late_minutes = 0
        if time_in_dt and record_status in ['complete', 'incomplete']:
            # Get employee's effective call time (handles flexible schedules)
            effective_call_time = employee.get_effective_call_time()
            buffer_mins = employee.buffer_minutes or 10

            try:
                # Parse call time (handles both "08:00" and "08:00 AM" formats)
                call_hour, call_min = parse_call_time(effective_call_time)
                call_time_dt = datetime.combine(record['date'], time(call_hour, call_min))
                # Add buffer to call time - employee should arrive by call_time + buffer
                latest_arrival = call_time_dt + timedelta(minutes=buffer_mins)

                if time_in_dt > latest_arrival:
                    # Employee is late
                    late_minutes = int((time_in_dt - latest_arrival).total_seconds() / 60)

                # Sanity check: late should not exceed work hours (e.g., max 8 hours = 480 mins)
                max_late = (employee.work_hours_per_day or 8) * 60
                if late_minutes > max_late:
                    late_minutes = 0  # Something's wrong with the calculation, don't mark as late
            except (ValueError, TypeError) as e:
                pass  # Invalid call time format, skip late calculation

        exceptions = record.get('exceptions', [])
        if record.get('auto_fixed'):
            for fix in record['auto_fixed']:
                if fix not in exceptions:
                    exceptions.append(f'auto_fixed:{fix}')

        # Add late exception if applicable
        if late_minutes > 0 and 'late' not in exceptions:
            exceptions.append('late')

        # Add holiday exception if applicable
        if is_holiday:
            holiday_tag = f'holiday:{holiday_type}'
            if holiday_tag not in exceptions:
                exceptions.append(holiday_tag)
            if holiday_name and f'holiday_name:{holiday_name}' not in exceptions:
                exceptions.append(f'holiday_name:{holiday_name}')

        if existing:
            existing.time_in = time_in_dt
            existing.time_out = time_out_dt
            existing.worked_minutes = record['worked_minutes']
            existing.late_minutes = late_minutes
            existing.status = status
            existing.has_exception = record['has_exception'] or late_minutes > 0
            existing.exceptions = exceptions if exceptions else None
            updated += 1
        else:
            attendance = ProcessedAttendance(
                employee_id=employee.id,
                date=record['date'],
                time_in=time_in_dt,
                time_out=time_out_dt,
                worked_minutes=record['worked_minutes'],
                late_minutes=late_minutes,
                status=status,
                has_exception=record['has_exception'] or late_minutes > 0,
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


def recalculate_attendance_late(
    db: Session,
    employee_id: int = None,
    date_from: date = None,
    date_to: date = None
) -> Dict[str, Any]:
    """
    Recalculate late minutes for attendance records based on current employee schedules.

    This is useful when:
    - Employee schedule was updated after attendance import
    - Notion sync updated employee call_time/time_out
    - Initial import used wrong schedule

    Args:
        db: Database session
        employee_id: Optional - recalculate for specific employee only
        date_from: Optional - start date for recalculation
        date_to: Optional - end date for recalculation

    Returns:
        Summary of recalculated records
    """
    # Build query for attendance records
    query = db.query(ProcessedAttendance).join(Employee)

    if employee_id:
        query = query.filter(ProcessedAttendance.employee_id == employee_id)

    if date_from:
        query = query.filter(ProcessedAttendance.date >= date_from)

    if date_to:
        query = query.filter(ProcessedAttendance.date <= date_to)

    # Only recalculate records that have time_in
    query = query.filter(ProcessedAttendance.time_in.isnot(None))

    records = query.all()

    updated = 0
    unchanged = 0
    errors = []
    details = []

    for record in records:
        employee = db.query(Employee).filter(Employee.id == record.employee_id).first()
        if not employee:
            continue

        old_late = record.late_minutes or 0
        new_late = 0

        try:
            # Get employee's effective call time
            effective_call_time = employee.get_effective_call_time()
            buffer_mins = employee.buffer_minutes or 10

            # Parse call time
            call_hour, call_min = parse_call_time(effective_call_time)
            call_time_dt = datetime.combine(record.date, time(call_hour, call_min))

            # Add buffer - employee should arrive by call_time + buffer
            latest_arrival = call_time_dt + timedelta(minutes=buffer_mins)

            # Get time_in as datetime
            time_in_dt = record.time_in
            if isinstance(time_in_dt, datetime):
                pass  # Already datetime
            elif isinstance(time_in_dt, time):
                time_in_dt = datetime.combine(record.date, time_in_dt)
            else:
                continue  # Can't process

            # Calculate late minutes
            if time_in_dt > latest_arrival:
                new_late = int((time_in_dt - latest_arrival).total_seconds() / 60)
            else:
                new_late = 0  # On time or early

            # Sanity check: late should not exceed work hours
            max_late = (employee.work_hours_per_day or 8) * 60
            if new_late > max_late:
                new_late = 0  # Something's wrong, don't mark as late

            # Update if changed
            if new_late != old_late:
                record.late_minutes = new_late

                # Update exceptions
                exceptions = record.exceptions or []
                if isinstance(exceptions, str):
                    exceptions = [exceptions] if exceptions else []

                if new_late > 0 and 'late' not in exceptions:
                    exceptions.append('late')
                elif new_late == 0 and 'late' in exceptions:
                    exceptions.remove('late')

                record.exceptions = exceptions if exceptions else None
                record.has_exception = len(exceptions) > 0

                updated += 1
                details.append({
                    'employee': employee.full_name,
                    'employee_no': employee.employee_no,
                    'date': str(record.date),
                    'time_in': str(record.time_in),
                    'schedule': f"{employee.call_time} + {buffer_mins}min buffer",
                    'old_late': old_late,
                    'new_late': new_late,
                })
            else:
                unchanged += 1

        except Exception as e:
            errors.append(f"{employee.full_name} ({record.date}): {str(e)}")

    db.commit()

    return {
        'total_records': len(records),
        'updated': updated,
        'unchanged': unchanged,
        'errors': errors,
        'details': details[:50],  # Limit details to first 50 for response size
    }
