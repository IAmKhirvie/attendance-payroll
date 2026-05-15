"""
Payroll Import Service
======================
Import payroll data from Excel files and automatically create payslips.

Supports two formats:
1. Tabular format: Multiple employees in rows with column headers
2. I CAN LANGUAGE CENTER payslip format: Single payslip per sheet with specific cell positions
"""

import pandas as pd
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.payroll import PayrollRun, Payslip, PayrollStatus


# I CAN LANGUAGE CENTER Payslip Format - Cell positions (0-indexed)
# Format: (row, [possible columns]) for values
# The parser will check multiple columns and use the first non-empty value
# Excel columns: A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9
ICAN_FORMAT = {
    'company_check': (2, 2),  # "I CAN LANGUAGE CENTER INC."
    'payslip_check': (3, 2),  # "Pay Slip"
    'employee_name': (4, 4),  # Name value (column E)
    'job_title': (4, 9),      # Job Title value (column J)
    'period': (3, 9),         # Period value (column J)
    'date': (2, 9),           # Date value (column J)

    # Monthly rates - values in column D(3), E(4), or F(5)
    # Excel rows are 1-indexed, so row 9 = index 8
    'basic_salary_monthly': (8, [4, 3, 5]),   # Row 9, try E, D, F
    'allowance_monthly': (9, [4, 3, 5]),      # Row 10
    'prod_incentive_monthly': (10, [4, 3, 5]), # Row 11
    'lang_incentive_monthly': (11, [4, 3, 5]), # Row 12

    # Semi-monthly values - values in column H(7), I(8), or J(9)
    'basic_semi': (8, [8, 7, 9]),        # Row 9, try I, H, J
    'prod_incentive_semi': (9, [8, 7, 9]),   # Row 10
    'lang_incentive_semi': (10, [8, 7, 9]),  # Row 11
    'allowance_semi': (11, [8, 7, 9]),       # Row 12

    # Rates and additional earnings
    'daily_rate': (13, [4, 3, 5]),     # Row 14
    'hourly_rate': (14, [4, 3, 5]),    # Row 15
    'reg_ot': (13, [8, 7, 9]),         # Row 14
    'holiday': (14, [8, 7, 9]),        # Row 15

    # Absences/Lates - Row 17
    'absences_lates': (16, [4, 3, 5]),

    # Deductions - values in column H(7), I(8), or J(9)
    'sss': (17, [8, 7, 9]),        # Row 18
    'philhealth': (18, [8, 7, 9]), # Row 19
    'hdmf': (19, [8, 7, 9]),       # Row 20
    'wtax': (20, [8, 7, 9]),       # Row 21
    'net_pay': (21, [8, 7, 9]),    # Row 22
}


def get_cell_value_multi(df: pd.DataFrame, row: int, cols, default: Any = None) -> Any:
    """Get cell value, trying multiple columns."""
    if isinstance(cols, int):
        cols = [cols]

    for col in cols:
        val = get_cell_value(df, row, col, None)
        if val is not None and str(val).strip() and str(val).strip() not in ['nan', 'NaN', 'None']:
            # Skip if it looks like a label (text without numbers)
            val_str = str(val).strip()
            # Check if it contains any digit or is a pure number
            if any(c.isdigit() for c in val_str) or val_str.replace('.', '').replace('-', '').isdigit():
                return val
    return default


def get_cell_value(df: pd.DataFrame, row: int, col: int, default: Any = None) -> Any:
    """Safely get a cell value from dataframe."""
    try:
        if row < len(df) and col < len(df.columns):
            val = df.iloc[row, col]
            if pd.isna(val):
                return default
            return val
        return default
    except:
        return default


def parse_numeric(value: Any, default: float = 0.0) -> float:
    """Parse a value as numeric, handling various formats."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Remove currency symbols, commas, spaces
        cleaned = re.sub(r'[₱$,\s]', '', value)
        try:
            return float(cleaned) if cleaned else default
        except:
            return default
    return default


def parse_period_string(period_str: str) -> Tuple[Optional[date], Optional[date], int]:
    """
    Parse period string like "Jan 11 - Jan 25, 2026" into start/end dates and cutoff.

    Returns:
        Tuple of (period_start, period_end, cutoff)
    """
    if not period_str:
        return None, None, 1

    try:
        # Common patterns:
        # "Jan 11 - Jan 25, 2026"
        # "January 11 - January 25, 2026"
        # "01/11/2026 - 01/25/2026"

        # Try to find date range with dash
        parts = period_str.replace('–', '-').split('-')
        if len(parts) != 2:
            return None, None, 1

        start_str = parts[0].strip()
        end_str = parts[1].strip()

        # Extract year from end part if present
        year_match = re.search(r'(\d{4})', end_str)
        year = int(year_match.group(1)) if year_match else datetime.now().year

        # Parse start date
        # Try "Jan 11" or "January 11" format
        month_day_pattern = r'([A-Za-z]+)\s*(\d{1,2})'
        start_match = re.search(month_day_pattern, start_str)
        end_match = re.search(month_day_pattern, end_str)

        if start_match and end_match:
            month_names = {
                'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
                'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
                'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'september': 9,
                'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
            }

            start_month = month_names.get(start_match.group(1).lower())
            start_day = int(start_match.group(2))
            end_month = month_names.get(end_match.group(1).lower())
            end_day = int(end_match.group(2))

            if start_month and end_month:
                period_start = date(year, start_month, start_day)
                period_end = date(year, end_month, end_day)

                # Determine cutoff based on end day (files may span partial periods)
                cutoff = 1 if end_day <= 15 else 2

                return period_start, period_end, cutoff

        # Try numeric date format "01/11/2026"
        numeric_pattern = r'(\d{1,2})[/\-](\d{1,2})[/\-]?(\d{2,4})?'
        start_match = re.search(numeric_pattern, start_str)
        end_match = re.search(numeric_pattern, end_str)

        if start_match and end_match:
            # Assume MM/DD format
            start_month = int(start_match.group(1))
            start_day = int(start_match.group(2))
            end_month = int(end_match.group(1))
            end_day = int(end_match.group(2))

            if start_match.group(3):
                year = int(start_match.group(3))
                if year < 100:
                    year += 2000

            period_start = date(year, start_month, start_day)
            period_end = date(year, end_month, end_day)
            cutoff = 1 if end_day <= 15 else 2

            return period_start, period_end, cutoff

    except Exception as e:
        pass

    return None, None, 1


def is_ican_format(df: pd.DataFrame) -> bool:
    """Check if the dataframe is in I CAN LANGUAGE CENTER payslip format."""
    company = get_cell_value(df, 2, 2, '')
    payslip = get_cell_value(df, 3, 2, '')

    if isinstance(company, str) and 'I CAN' in company.upper():
        return True
    if isinstance(payslip, str) and 'PAY SLIP' in payslip.upper():
        return True

    # Also check for the structure markers
    basic_label = get_cell_value(df, 8, 2, '')
    if isinstance(basic_label, str) and 'BASIC' in basic_label.upper():
        return True

    return False


def parse_ican_payslip(df: pd.DataFrame, sheet_name: str = None) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    """
    Parse a single I CAN LANGUAGE CENTER format payslip.

    Returns:
        Tuple of (parsed record or None, list of warnings)
    """
    warnings = []

    # Get employee name
    employee_name = get_cell_value(df, *ICAN_FORMAT['employee_name'][:2], '')
    if not employee_name or not isinstance(employee_name, str):
        return None, [f"No employee name found in sheet {sheet_name}"]

    employee_name = str(employee_name).strip()

    # Get period and parse it
    period = get_cell_value(df, *ICAN_FORMAT['period'][:2], '')
    period_str = str(period) if period else ''
    period_start, period_end, cutoff = parse_period_string(period_str)

    # Helper to get value from format spec (row, cols)
    def get_val(key):
        spec = ICAN_FORMAT[key]
        row = spec[0]
        cols = spec[1]
        return get_cell_value_multi(df, row, cols)

    # Parse all numeric values
    record = {
        'sheet_name': sheet_name,
        'employee_no': '',
        'employee_name': employee_name,
        'job_title': str(get_cell_value(df, ICAN_FORMAT['job_title'][0], ICAN_FORMAT['job_title'][1], '') or ''),
        'period': period_str,
        'period_start': period_start,
        'period_end': period_end,
        'cutoff': cutoff,

        # Monthly rates
        'basic_salary_monthly': parse_numeric(get_val('basic_salary_monthly')),
        'allowance_monthly': parse_numeric(get_val('allowance_monthly')),
        'prod_incentive_monthly': parse_numeric(get_val('prod_incentive_monthly')),
        'lang_incentive_monthly': parse_numeric(get_val('lang_incentive_monthly')),

        # Semi-monthly amounts (these are the actual payslip values)
        'basic_salary': parse_numeric(get_val('basic_semi')),
        'allowance': parse_numeric(get_val('allowance_semi')),
        'productivity': parse_numeric(get_val('prod_incentive_semi')),
        'language': parse_numeric(get_val('lang_incentive_semi')),

        # Rates
        'daily_rate': parse_numeric(get_val('daily_rate')),
        'hourly_rate': parse_numeric(get_val('hourly_rate')),

        # Additional earnings
        'overtime': parse_numeric(get_val('reg_ot')),
        'regular_holiday': parse_numeric(get_val('holiday')),
        'regular_holiday_ot': 0,
        'snwh': 0,
        'snwh_ot': 0,
        'night_diff': 0,

        # Absences/Lates (combined field)
        'absences': parse_numeric(get_val('absences_lates')),
        'late': 0,
        'undertime': 0,

        # Deductions
        'sss': parse_numeric(get_val('sss')),
        'philhealth': parse_numeric(get_val('philhealth')),
        'pagibig': parse_numeric(get_val('hdmf')),
        'tax': parse_numeric(get_val('wtax')),
        'loans': 0,

        # Net pay (for verification)
        'net_pay_from_file': parse_numeric(get_val('net_pay')),

        # Attendance (not in this format, defaults)
        'days_worked': 0,
        'days_absent': 0,
        'late_count': 0,
        'late_minutes': 0,
        'ot_hours': 0,

        'row_number': 1,  # Single payslip per sheet
    }

    return record, warnings


def parse_ican_excel(file_path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parse an Excel file in I CAN LANGUAGE CENTER payslip format.
    Handles multiple sheets (one payslip per sheet).

    Returns:
        Tuple of (list of parsed records, list of warnings)
    """
    warnings = []
    records = []

    try:
        # Read all sheets
        xlsx = pd.ExcelFile(file_path, engine='openpyxl')
        sheet_names = xlsx.sheet_names

        for sheet_name in sheet_names:
            try:
                df = pd.read_excel(xlsx, sheet_name=sheet_name, header=None)

                if df.empty:
                    warnings.append(f"Sheet '{sheet_name}' is empty")
                    continue

                record, sheet_warnings = parse_ican_payslip(df, sheet_name)
                warnings.extend(sheet_warnings)

                if record:
                    records.append(record)

            except Exception as e:
                warnings.append(f"Error parsing sheet '{sheet_name}': {str(e)}")

        return records, warnings

    except Exception as e:
        return [], [f"Failed to read Excel file: {str(e)}"]


# Expected column mappings (flexible - will try multiple variations)
COLUMN_MAPPINGS = {
    'employee_no': ['employee_no', 'employee no', 'emp_no', 'emp no', 'id', 'employee id', 'emp_id', 'empno'],
    'employee_name': ['employee_name', 'employee name', 'name', 'full_name', 'full name', 'empname'],
    'basic_salary': ['basic_salary', 'basic salary', 'basic', 'basic_semi', 'basic semi', 'basic pay'],
    'allowance': ['allowance', 'allowance_semi', 'allowance semi', 'allow'],
    'productivity': ['productivity', 'productivity_incentive', 'productivity incentive', 'prod_incentive', 'prod'],
    'language': ['language', 'language_incentive', 'language incentive', 'lang_incentive', 'lang'],
    'regular_holiday': ['regular_holiday', 'regular holiday', 'reg_holiday', 'holiday', 'rh'],
    'regular_holiday_ot': ['regular_holiday_ot', 'regular holiday ot', 'rh_ot', 'holiday_ot'],
    'snwh': ['snwh', 'special_holiday', 'special holiday', 'special_non_working', 'sh'],
    'snwh_ot': ['snwh_ot', 'special_holiday_ot', 'sh_ot'],
    'overtime': ['overtime', 'ot', 'ot_pay', 'overtime_pay'],
    'night_diff': ['night_diff', 'night differential', 'nd', 'night_differential'],
    'sss': ['sss', 'sss_deduction'],
    'philhealth': ['philhealth', 'ph', 'phic', 'philhealth_deduction'],
    'pagibig': ['pagibig', 'pag-ibig', 'pag_ibig', 'hdmf', 'pagibig_deduction'],
    'tax': ['tax', 'withholding_tax', 'withholding tax', 'wtax', 'income_tax'],
    'loans': ['loans', 'loan', 'loan_deduction', 'other_deductions'],
    'absences': ['absences', 'absent', 'absence_deduction', 'absent_days'],
    'late': ['late', 'late_deduction', 'tardiness', 'late_amount'],
    'undertime': ['undertime', 'undertime_deduction', 'ut'],
    'days_worked': ['days_worked', 'days worked', 'work_days', 'worked_days'],
    'days_absent': ['days_absent', 'days absent', 'absent_days'],
    'late_count': ['late_count', 'late count', 'times_late'],
    'late_minutes': ['late_minutes', 'late minutes', 'total_late_minutes'],
    'ot_hours': ['ot_hours', 'overtime_hours', 'overtime hours'],
}


def normalize_column_name(col: str) -> str:
    """Normalize column name for matching."""
    return col.lower().strip().replace('_', ' ').replace('-', ' ')


def find_column(df_columns: List[str], target_keys: List[str]) -> Optional[str]:
    """Find a column in the dataframe that matches any of the target keys."""
    normalized_df_cols = {normalize_column_name(c): c for c in df_columns}

    for key in target_keys:
        normalized_key = normalize_column_name(key)
        if normalized_key in normalized_df_cols:
            return normalized_df_cols[normalized_key]
    return None


def get_value(row: pd.Series, df_columns: List[str], mapping_key: str, default: Any = 0) -> Any:
    """Get a value from a row using flexible column mapping."""
    col = find_column(df_columns, COLUMN_MAPPINGS.get(mapping_key, []))
    if col and col in row.index:
        val = row[col]
        if pd.isna(val):
            return default
        return val
    return default


def parse_payroll_excel(file_path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parse an Excel file containing payroll data.
    Auto-detects format: I CAN payslip format or tabular format.

    Returns:
        Tuple of (list of parsed records, list of warnings/errors)
    """
    warnings = []
    records = []

    try:
        # First, try to detect format by reading without headers
        try:
            df_raw = pd.read_excel(file_path, engine='openpyxl', header=None)
        except:
            df_raw = pd.read_excel(file_path, engine='xlrd', header=None)

        # Check if it's I CAN LANGUAGE CENTER payslip format
        if is_ican_format(df_raw):
            return parse_ican_excel(file_path)

        # Otherwise, use tabular format
        try:
            df = pd.read_excel(file_path, engine='openpyxl')  # xlsx
        except:
            df = pd.read_excel(file_path, engine='xlrd')  # xls

        if df.empty:
            return [], ["File is empty"]

        # Get column list
        columns = list(df.columns)

        # Check for required column (employee_no or employee_name)
        emp_no_col = find_column(columns, COLUMN_MAPPINGS['employee_no'])
        emp_name_col = find_column(columns, COLUMN_MAPPINGS['employee_name'])

        if not emp_no_col and not emp_name_col:
            return [], ["Could not find employee identifier column (Employee No or Employee Name)"]

        # Process each row
        for idx, row in df.iterrows():
            try:
                # Skip empty rows
                if emp_no_col and pd.isna(row[emp_no_col]) and emp_name_col and pd.isna(row[emp_name_col]):
                    continue

                record = {
                    'row_number': idx + 2,  # Excel row (1-indexed + header)
                    'employee_no': str(get_value(row, columns, 'employee_no', '')).strip(),
                    'employee_name': str(get_value(row, columns, 'employee_name', '')).strip(),

                    # Earnings
                    'basic_salary': float(get_value(row, columns, 'basic_salary', 0)),
                    'allowance': float(get_value(row, columns, 'allowance', 0)),
                    'productivity': float(get_value(row, columns, 'productivity', 0)),
                    'language': float(get_value(row, columns, 'language', 0)),
                    'regular_holiday': float(get_value(row, columns, 'regular_holiday', 0)),
                    'regular_holiday_ot': float(get_value(row, columns, 'regular_holiday_ot', 0)),
                    'snwh': float(get_value(row, columns, 'snwh', 0)),
                    'snwh_ot': float(get_value(row, columns, 'snwh_ot', 0)),
                    'overtime': float(get_value(row, columns, 'overtime', 0)),
                    'night_diff': float(get_value(row, columns, 'night_diff', 0)),

                    # Deductions
                    'sss': float(get_value(row, columns, 'sss', 0)),
                    'philhealth': float(get_value(row, columns, 'philhealth', 0)),
                    'pagibig': float(get_value(row, columns, 'pagibig', 0)),
                    'tax': float(get_value(row, columns, 'tax', 0)),
                    'loans': float(get_value(row, columns, 'loans', 0)),
                    'absences': float(get_value(row, columns, 'absences', 0)),
                    'late': float(get_value(row, columns, 'late', 0)),
                    'undertime': float(get_value(row, columns, 'undertime', 0)),

                    # Attendance info
                    'days_worked': float(get_value(row, columns, 'days_worked', 0)),
                    'days_absent': float(get_value(row, columns, 'days_absent', 0)),
                    'late_count': int(get_value(row, columns, 'late_count', 0)),
                    'late_minutes': int(get_value(row, columns, 'late_minutes', 0)),
                    'ot_hours': float(get_value(row, columns, 'ot_hours', 0)),
                }

                # Skip if no employee identifier
                if not record['employee_no'] and not record['employee_name']:
                    continue

                records.append(record)

            except Exception as e:
                warnings.append(f"Row {idx + 2}: Error parsing - {str(e)}")

        return records, warnings

    except Exception as e:
        return [], [f"Failed to read Excel file: {str(e)}"]


def import_payroll_from_file(
    db: Session,
    file_path: str,
    period_start: date = None,
    period_end: date = None,
    cutoff: int = None,
    created_by: int = None,
    auto_create_employees: bool = True
) -> Dict[str, Any]:
    """
    Import payroll data from Excel file and create payslips.
    Automatically detects period from file if not provided.
    Optionally creates employees that don't exist.

    Args:
        db: Database session
        file_path: Path to the Excel file
        period_start: Payroll period start date (auto-detected if None)
        period_end: Payroll period end date (auto-detected if None)
        cutoff: 1 for 1st cutoff (1-15), 2 for 2nd cutoff (16-end) (auto-detected if None)
        created_by: User ID who initiated the import
        auto_create_employees: If True, create employees that don't exist

    Returns:
        Dictionary with import results
    """
    # Parse the Excel file
    records, parse_warnings = parse_payroll_excel(file_path)

    if not records:
        return {
            'success': False,
            'message': 'No valid records found in file',
            'warnings': parse_warnings,
            'payslips_created': 0
        }

    # Auto-detect period from first record if not provided
    if period_start is None or period_end is None:
        first_record = records[0]
        if first_record.get('period_start') and first_record.get('period_end'):
            period_start = first_record['period_start']
            period_end = first_record['period_end']
            cutoff = first_record.get('cutoff', 1)
            parse_warnings.append(f"Auto-detected period: {period_start} to {period_end}, Cutoff: {cutoff}")
        else:
            # Default to current semi-monthly period
            today = date.today()
            if today.day <= 15:
                period_start = date(today.year, today.month, 1)
                period_end = date(today.year, today.month, 15)
                cutoff = 1
            else:
                period_start = date(today.year, today.month, 16)
                # Last day of month
                if today.month == 12:
                    period_end = date(today.year + 1, 1, 1) - timedelta(days=1)
                else:
                    period_end = date(today.year, today.month + 1, 1) - timedelta(days=1)
                cutoff = 2
            parse_warnings.append(f"Could not detect period from file, using current period: {period_start} to {period_end}")

    if cutoff is None:
        cutoff = 1 if period_end.day <= 15 else 2

    # Check for existing payroll run for this period
    existing_run = db.query(PayrollRun).filter(
        PayrollRun.period_start == period_start,
        PayrollRun.period_end == period_end
    ).first()

    if existing_run:
        # Delete existing payslips for this run
        db.query(Payslip).filter(Payslip.payroll_run_id == existing_run.id).delete()
        payroll_run = existing_run
        payroll_run.status = PayrollStatus.REVIEW
    else:
        # Create new payroll run
        payroll_run = PayrollRun(
            period_start=period_start,
            period_end=period_end,
            cutoff=cutoff,
            status=PayrollStatus.REVIEW,
            run_by=created_by,
            run_at=datetime.utcnow()
        )
        db.add(payroll_run)
        db.flush()

    # Process records and create payslips
    payslips_created = 0
    not_found = []
    errors = []

    total_gross = Decimal('0')
    total_deductions = Decimal('0')
    total_net = Decimal('0')

    for record in records:
        try:
            # Find employee by employee_no or name
            employee = None

            if record['employee_no']:
                employee = db.query(Employee).filter(
                    Employee.employee_no == record['employee_no']
                ).first()

            if not employee and record['employee_name']:
                # Try to find by name in various formats
                name = record['employee_name'].strip()

                # Try direct matches first
                employee = db.query(Employee).filter(
                    (Employee.first_name + ' ' + Employee.last_name == name) |
                    (Employee.last_name + ', ' + Employee.first_name == name) |
                    (Employee.last_name + ' ' + Employee.first_name == name)
                ).first()

                # Try "Last, First, Middle" format (I CAN format)
                if not employee and ',' in name:
                    parts = [p.strip() for p in name.split(',')]
                    if len(parts) >= 2:
                        last_name = parts[0]
                        first_name = parts[1]
                        middle_name = parts[2] if len(parts) > 2 else None

                        query = db.query(Employee).filter(
                            Employee.last_name.ilike(f'%{last_name}%'),
                            Employee.first_name.ilike(f'%{first_name}%')
                        )
                        if middle_name:
                            query = query.filter(Employee.middle_name.ilike(f'%{middle_name}%'))
                        employee = query.first()

                # Try partial match on last name if still not found
                if not employee:
                    name_parts = name.replace(',', ' ').split()
                    if name_parts:
                        # Try first part as last name
                        employee = db.query(Employee).filter(
                            Employee.last_name.ilike(f'%{name_parts[0]}%')
                        ).first()

            if not employee:
                if auto_create_employees and record['employee_name']:
                    # Auto-create employee from payslip data
                    name = record['employee_name']
                    parts = [p.strip() for p in name.split(',')]

                    if len(parts) >= 2:
                        last_name = parts[0]
                        first_name = parts[1]
                        middle_name = parts[2] if len(parts) > 2 else None
                    else:
                        # Try space-separated: "First Last"
                        name_parts = name.split()
                        first_name = name_parts[0] if name_parts else name
                        last_name = name_parts[-1] if len(name_parts) > 1 else ''
                        middle_name = ' '.join(name_parts[1:-1]) if len(name_parts) > 2 else None

                    # Generate employee number
                    emp_count = db.query(Employee).count()
                    new_emp_no = f"EMP{emp_count + 1:04d}"

                    employee = Employee(
                        employee_no=new_emp_no,
                        first_name=first_name,
                        middle_name=middle_name,
                        last_name=last_name,
                        position=record.get('job_title', ''),
                        employment_type='regular',
                        status='active',
                        is_active=True,
                        # Set salary rates from import
                        basic_salary=str(record.get('basic_salary_monthly', 0) or (record['basic_salary'] * 2)),
                        daily_rate=str(record.get('daily_rate', 0)),
                        hourly_rate=str(record.get('hourly_rate', 0)),
                        allowance=str(record.get('allowance_monthly', 0) or (record['allowance'] * 2)),
                        productivity_incentive=str(record.get('prod_incentive_monthly', 0) or (record['productivity'] * 2)),
                        language_incentive=str(record.get('lang_incentive_monthly', 0) or (record['language'] * 2)),
                        sss_contribution=str(record['sss']),
                        philhealth_contribution=str(record['philhealth']),
                        pagibig_contribution=str(record['pagibig']),
                        tax_amount=str(record['tax'] * 2),  # Monthly tax
                    )
                    db.add(employee)
                    db.flush()
                    parse_warnings.append(f"Auto-created employee: {employee.employee_no} - {first_name} {last_name}")
                else:
                    not_found.append({
                        'row': record.get('row_number', record.get('sheet_name', '?')),
                        'employee_no': record['employee_no'],
                        'employee_name': record['employee_name']
                    })
                    continue

            # Update employee rates if they're missing/zero
            if employee:
                updated_fields = []

                # Update basic salary if not set
                if not employee.basic_salary or float(employee.basic_salary or 0) == 0:
                    monthly = record.get('basic_salary_monthly', 0) or (record['basic_salary'] * 2)
                    if monthly > 0:
                        employee.basic_salary = str(monthly)
                        updated_fields.append('basic_salary')

                # Update daily rate if not set
                if not employee.daily_rate or float(employee.daily_rate or 0) == 0:
                    if record.get('daily_rate', 0) > 0:
                        employee.daily_rate = str(record['daily_rate'])
                        updated_fields.append('daily_rate')

                # Update hourly rate if not set
                if not employee.hourly_rate or float(employee.hourly_rate or 0) == 0:
                    if record.get('hourly_rate', 0) > 0:
                        employee.hourly_rate = str(record['hourly_rate'])
                        updated_fields.append('hourly_rate')

                # Update government contributions if not set
                if not employee.sss_contribution or float(employee.sss_contribution or 0) == 0:
                    if record.get('sss', 0) > 0:
                        employee.sss_contribution = str(record['sss'])
                        updated_fields.append('sss')

                if not employee.philhealth_contribution or float(employee.philhealth_contribution or 0) == 0:
                    if record.get('philhealth', 0) > 0:
                        employee.philhealth_contribution = str(record['philhealth'])
                        updated_fields.append('philhealth')

                if not employee.pagibig_contribution or float(employee.pagibig_contribution or 0) == 0:
                    if record.get('pagibig', 0) > 0:
                        employee.pagibig_contribution = str(record['pagibig'])
                        updated_fields.append('pagibig')

                if updated_fields:
                    parse_warnings.append(f"Updated {employee.first_name} {employee.last_name}: {', '.join(updated_fields)}")

            # Calculate earnings
            earnings = {
                'basic_semi': record['basic_salary'],
                'allowance_semi': record['allowance'],
                'productivity_incentive_semi': record['productivity'],
                'language_incentive_semi': record['language'],
                'regular_holiday': record['regular_holiday'],
                'regular_holiday_ot': record['regular_holiday_ot'],
                'snwh': record['snwh'],
                'snwh_ot': record['snwh_ot'],
                'overtime': record['overtime'],
                'night_diff': record['night_diff'],
                'absent_deduction': record['absences'],
                'late_deduction': record['late'],
                'undertime_deduction': record['undertime'],
            }

            # Calculate deductions
            deductions = {
                'sss': record['sss'],
                'philhealth': record['philhealth'],
                'pagibig': record['pagibig'],
                'tax': record['tax'],
                'loans': record['loans'],
            }

            # Calculate totals
            gross = sum([
                record['basic_salary'],
                record['allowance'],
                record['productivity'],
                record['language'],
                record['regular_holiday'],
                record['regular_holiday_ot'],
                record['snwh'],
                record['snwh_ot'],
                record['overtime'],
                record['night_diff'],
            ]) - record['absences'] - record['late'] - record['undertime']

            deduction_total = sum([
                record['sss'],
                record['philhealth'],
                record['pagibig'],
                record['tax'],
                record['loans'],
            ])

            net = gross - deduction_total

            # Create payslip
            payslip = Payslip(
                payroll_run_id=payroll_run.id,
                employee_id=employee.id,
                earnings=earnings,
                deductions=deductions,
                total_earnings=Decimal(str(gross)),
                total_deductions=Decimal(str(deduction_total)),
                net_pay=Decimal(str(net)),
                days_worked=Decimal(str(record['days_worked'])),
                days_absent=Decimal(str(record['days_absent'])),
                late_count=record['late_count'],
                total_late_minutes=record['late_minutes'],
                overtime_hours=Decimal(str(record['ot_hours'])),
                is_released=False
            )
            db.add(payslip)

            payslips_created += 1
            total_gross += Decimal(str(gross))
            total_deductions += Decimal(str(deduction_total))
            total_net += Decimal(str(net))

        except Exception as e:
            errors.append({
                'row': record['row_number'],
                'employee_no': record['employee_no'],
                'error': str(e)
            })

    # Update payroll run totals
    payroll_run.total_gross = total_gross
    payroll_run.total_deductions = total_deductions
    payroll_run.total_net = total_net
    payroll_run.employee_count = payslips_created

    db.commit()

    return {
        'success': True,
        'message': f'Successfully imported {payslips_created} payslips',
        'payroll_run_id': payroll_run.id,
        'payslips_created': payslips_created,
        'not_found': not_found,
        'errors': errors,
        'warnings': parse_warnings,
        'totals': {
            'gross': float(total_gross),
            'deductions': float(total_deductions),
            'net': float(total_net)
        }
    }


def generate_payroll_template() -> bytes:
    """
    Generate a sample Excel template for payroll import.

    Returns:
        Excel file as bytes
    """
    import io

    # Create sample data
    data = {
        'Employee No': ['EMP0001', 'EMP0002', 'EMP0003'],
        'Employee Name': ['Juan Dela Cruz', 'Maria Santos', 'Pedro Reyes'],
        'Basic Salary': [15000, 12000, 18000],
        'Allowance': [2000, 1500, 2500],
        'Productivity': [1000, 800, 1200],
        'Language': [500, 0, 500],
        'Regular Holiday': [0, 0, 1500],
        'Regular Holiday OT': [0, 0, 0],
        'SNWH': [0, 0, 0],
        'SNWH OT': [0, 0, 0],
        'Overtime': [2000, 1500, 0],
        'Night Diff': [0, 500, 0],
        'SSS': [900, 720, 1080],
        'PhilHealth': [375, 300, 450],
        'Pag-IBIG': [200, 200, 200],
        'Tax': [500, 200, 800],
        'Loans': [0, 1000, 0],
        'Absences': [0, 500, 0],
        'Late': [100, 0, 0],
        'Days Worked': [11, 10, 11],
        'Days Absent': [0, 1, 0],
        'Late Count': [2, 0, 0],
        'Late Minutes': [15, 0, 0],
        'OT Hours': [8, 6, 0],
    }

    df = pd.DataFrame(data)

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Payroll')

    buffer.seek(0)
    return buffer.getvalue()


def parse_time_ampm(time_str: str) -> Optional[str]:
    """Convert time like '8am', '5pm', '10am' to 'HH:MM AM/PM' format."""
    if not time_str or pd.isna(time_str):
        return None

    time_str = str(time_str).lower().strip()
    match = re.match(r'^(\d{1,2})(am|pm)$', time_str)
    if match:
        hour = int(match.group(1))
        period = match.group(2).upper()
        return f"{hour:02d}:00 {period}"
    return None


def normalize_name(name: str) -> str:
    """Normalize a name for comparison."""
    import unicodedata
    name = name.lower().strip()
    # Remove periods, commas, extra spaces
    name = re.sub(r'[.,]', ' ', name)
    name = ' '.join(name.split())
    # Replace ñ with n
    name = name.replace('ñ', 'n')
    # Remove accents
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    return name


def find_employee_by_fullname(db: Session, name: str) -> Optional[Employee]:
    """
    Find employee by matching full name (fuzzy match).

    Handles various name formats:
    - "Last, First, Middle" (payroll format)
    - "First Middle Last" (database format)
    - "Ma. Jalyn Paula Galicia" matches "De Galicia, Ma. Jalyn Paula"
    """
    if not name:
        return None

    name = str(name).strip()
    normalized_input = normalize_name(name)

    # Parse name (Last, First, Middle format)
    name_parts = [p.strip() for p in name.split(',')]
    if len(name_parts) >= 2:
        last_name = normalize_name(name_parts[0])
        first_name = normalize_name(name_parts[1])
        # Handle "De Galicia" -> also try just "Galicia"
        last_name_simple = last_name.split()[-1] if ' ' in last_name else last_name
    else:
        parts = name.split()
        first_name = normalize_name(parts[0]) if parts else normalize_name(name)
        last_name = normalize_name(parts[-1]) if len(parts) > 1 else ''
        last_name_simple = last_name

    # Get all words from the input name for flexible matching
    all_input_words = set(normalized_input.split())

    all_employees = db.query(Employee).filter(Employee.is_active == True).all()

    # Score each employee and find best match
    best_match = None
    best_score = 0

    for emp in all_employees:
        emp_first = normalize_name(emp.first_name or '')
        emp_last = normalize_name(emp.last_name or '')
        emp_full = normalize_name(emp.full_name)
        emp_words = set(emp_full.split())

        score = 0

        # Exact full name match
        if normalized_input == emp_full:
            return emp

        # Check first name match
        if first_name and (first_name in emp_first or emp_first in first_name):
            score += 3

        # Check last name match (try both full and simple)
        if last_name:
            if last_name == emp_last or last_name in emp_last or emp_last in last_name:
                score += 3
            elif last_name_simple == emp_last or last_name_simple in emp_last:
                score += 2

        # Check word overlap
        common_words = all_input_words.intersection(emp_words)
        score += len(common_words)

        # Check if all first name parts are in employee's first name
        first_parts = first_name.split()
        if all(p in emp_first for p in first_parts):
            score += 2

        if score > best_score and score >= 3:  # Minimum score threshold
            best_score = score
            best_match = emp

    return best_match


def import_payslip_file(
    db: Session,
    file_path: str,
    sheet_name: str = 'Payroll List '
) -> Dict[str, Any]:
    """
    Import payslip data from Excel file.

    For each employee in the file:
    1. Updates their Employee record (salary, schedule, deductions, etc.)
    2. Auto-recalculates late minutes after schedule updates

    File columns used:
    - Col 2: Employee name
    - Col 3: Job Title/Position
    - Col 4: Employment Type
    - Col 5: Work hours (e.g., "8hrs")
    - Col 6: Call time (e.g., "10am", "8am")
    - Col 7: Time out (e.g., "7pm", "5pm")
    - Col 11-14: Basic, Allowance, Prod Incentive, Lang Incentive
    - Col 55-57: SSS EE, PhilHealth EE, Pag-IBIG EE

    Just upload the file - everything gets imported and updated!
    """
    results = {
        "success": True,
        "total": 0,
        "imported": 0,
        "not_found": [],
        "errors": [],
        "employees_updated": [],
        "payslips_created": [],
        "schedules_updated": 0
    }

    try:
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None, engine='openpyxl')
    except Exception as e:
        results["success"] = False
        results["errors"].append(f"Failed to read sheet '{sheet_name}': {str(e)}")
        return results

    def get_num(row, col, default=0):
        if col >= len(row):
            return default
        val = row.iloc[col]
        if pd.isna(val):
            return default
        try:
            return float(val)
        except:
            return default

    def get_str(row, col, default=''):
        if col >= len(row):
            return default
        val = row.iloc[col]
        if pd.isna(val):
            return default
        return str(val).strip()

    def parse_work_hours(hrs_str):
        """Parse work hours like '8hrs', '4hrs' to integer."""
        if not hrs_str:
            return None
        hrs_str = str(hrs_str).lower().strip()
        match = re.match(r'^(\d+)', hrs_str)
        if match:
            return int(match.group(1))
        return None

    # Process each employee row (data starts at row 2, index 2)
    for row_idx in range(2, len(df)):
        row = df.iloc[row_idx]

        emp_name = row.iloc[2] if pd.notna(row.iloc[2]) else None
        if not emp_name:
            continue

        results["total"] += 1
        emp_name = str(emp_name).strip()

        try:
            employee = find_employee_by_fullname(db, emp_name)

            if not employee:
                results["not_found"].append(emp_name)
                continue

            # === GET ALL DATA FROM FILE ===
            # Schedule info
            job_title = get_str(row, 3)
            emp_type = get_str(row, 4)
            work_hours_str = get_str(row, 5)
            call_time_str = get_str(row, 6)  # e.g., "10am"
            time_out_str = get_str(row, 7)   # e.g., "7pm"

            # Salary info
            basic_monthly = get_num(row, 11)
            allowance_monthly = get_num(row, 12)
            prod_monthly = get_num(row, 13)
            lang_monthly = get_num(row, 14)

            # Government deductions
            sss_ee = get_num(row, 55)
            phil_ee = get_num(row, 56)
            pagibig_ee = get_num(row, 57)

            # === UPDATE EMPLOYEE RECORD ===
            updated_fields = []

            # Update salary
            if basic_monthly > 0:
                employee.basic_salary = str(basic_monthly)
                updated_fields.append('basic_salary')
            if allowance_monthly > 0:
                employee.allowance = str(allowance_monthly)
                updated_fields.append('allowance')
            if prod_monthly > 0:
                employee.productivity_incentive = str(prod_monthly)
                updated_fields.append('productivity_incentive')
            if lang_monthly > 0:
                employee.language_incentive = str(lang_monthly)
                updated_fields.append('language_incentive')

            # Update deductions
            if sss_ee > 0:
                employee.sss_contribution = str(sss_ee)
            if phil_ee > 0:
                employee.philhealth_contribution = str(phil_ee)
            if pagibig_ee > 0:
                employee.pagibig_contribution = str(pagibig_ee)

            # Update schedule (convert "10am" to "10:00 AM")
            schedule_changed = False
            if call_time_str:
                new_call_time = parse_time_ampm(call_time_str)
                if new_call_time and employee.call_time != new_call_time:
                    employee.call_time = new_call_time
                    updated_fields.append('call_time')
                    schedule_changed = True

            if time_out_str:
                new_time_out = parse_time_ampm(time_out_str)
                if new_time_out and employee.time_out != new_time_out:
                    employee.time_out = new_time_out
                    updated_fields.append('time_out')
                    schedule_changed = True

            # Update work hours
            work_hours = parse_work_hours(work_hours_str)
            if work_hours and employee.work_hours_per_day != work_hours:
                employee.work_hours_per_day = work_hours
                updated_fields.append('work_hours_per_day')

            # Update position if provided
            if job_title and employee.position != job_title:
                employee.position = job_title
                updated_fields.append('position')

            # Update employment type
            if emp_type:
                new_type = None
                emp_type_lower = emp_type.lower()
                if 'part' in emp_type_lower:
                    new_type = 'part_time'
                elif 'full' in emp_type_lower:
                    new_type = 'full_time'
                elif 'fixed' in emp_type_lower:
                    new_type = 'contract'
                if new_type and employee.employment_type != new_type:
                    employee.employment_type = new_type
                    updated_fields.append('employment_type')

            if schedule_changed:
                results["schedules_updated"] += 1

            results["employees_updated"].append({
                "name": emp_name,
                "employee_no": employee.employee_no,
                "basic_monthly": basic_monthly,
                "call_time": employee.call_time,
                "time_out": employee.time_out,
                "work_hours": work_hours,
                "sss": sss_ee,
                "philhealth": phil_ee,
                "pagibig": pagibig_ee,
                "updated_fields": updated_fields
            })

            results["imported"] += 1

        except Exception as e:
            results["errors"].append(f"Row {row_idx + 1} ({emp_name}): {str(e)}")

    db.commit()

    # Auto-recalculate late minutes if schedules were updated
    if results["schedules_updated"] > 0:
        try:
            from app.services.attendance_recalc import recalculate_all_late_minutes
            recalc_result = recalculate_all_late_minutes(db)
            results["late_recalculation"] = recalc_result
        except Exception as e:
            results["late_recalculation_error"] = str(e)

    results["message"] = f"Imported {results['imported']} employees. Updated salary, schedule, and deductions."
    if results["schedules_updated"] > 0:
        results["message"] += f" Updated {results['schedules_updated']} schedules and recalculated late minutes."
    return results
