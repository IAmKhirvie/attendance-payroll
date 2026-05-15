"""
Philippine Payroll Calculator
=============================
Simplified payroll calculator with manual adjustments support.
All amounts in Philippine Peso (PHP).

ICAN Attendance Deduction Formulas (enabled by default):
- Absence Deduction: Daily Rate = Monthly Salary × 12 ÷ 261 days
- Tardiness/Undertime: Minute Rate = Daily Rate ÷ Hours per day ÷ 60 minutes

Cutoff Schedule:
- 1st cutoff (1-15): Deduct absences, lates, loans, tax (NO government benefits)
- 2nd cutoff (16-end): Deduct absences, lates, tax, SSS, PhilHealth, Pag-IBIG (NO loans)

Semi-monthly = Monthly amount / 2

Earnings:
- Basic Pay (Semi)
- Allowance (Semi)
- Productivity Incentive (Semi)
- Language Incentive (Semi)
- Regular Holiday Pay
- Regular Holiday OT
- SNWH (Special Non-Working Holiday)
- SNWH OT

Deductions:
- Absences (days × ICAN daily rate)
- Late (minutes × ICAN minute rate)
- Undertime (minutes × ICAN minute rate)
- Government contributions (based on cutoff)
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.attendance import ProcessedAttendance, AttendanceStatus, ImportRecord, ImportBatch
from app.models.payroll import PayrollRun, Payslip, PayrollStatus, PayrollSettings, ContributionTable, ContributionType
from app.models.loan import Loan, LoanDeduction, LoanStatus


# 2024 SSS Contribution Table
SSS_TABLE_2024 = [
    {"min": 0, "max": 4249.99, "ee": 180},
    {"min": 4250, "max": 4749.99, "ee": 202.50},
    {"min": 4750, "max": 5249.99, "ee": 225},
    {"min": 5250, "max": 5749.99, "ee": 247.50},
    {"min": 5750, "max": 6249.99, "ee": 270},
    {"min": 6250, "max": 6749.99, "ee": 292.50},
    {"min": 6750, "max": 7249.99, "ee": 315},
    {"min": 7250, "max": 7749.99, "ee": 337.50},
    {"min": 7750, "max": 8249.99, "ee": 360},
    {"min": 8250, "max": 8749.99, "ee": 382.50},
    {"min": 8750, "max": 9249.99, "ee": 405},
    {"min": 9250, "max": 9749.99, "ee": 427.50},
    {"min": 9750, "max": 10249.99, "ee": 450},
    {"min": 10250, "max": 10749.99, "ee": 472.50},
    {"min": 10750, "max": 11249.99, "ee": 495},
    {"min": 11250, "max": 11749.99, "ee": 517.50},
    {"min": 11750, "max": 12249.99, "ee": 540},
    {"min": 12250, "max": 12749.99, "ee": 562.50},
    {"min": 12750, "max": 13249.99, "ee": 585},
    {"min": 13250, "max": 13749.99, "ee": 607.50},
    {"min": 13750, "max": 14249.99, "ee": 630},
    {"min": 14250, "max": 14749.99, "ee": 652.50},
    {"min": 14750, "max": 15249.99, "ee": 675},
    {"min": 15250, "max": 15749.99, "ee": 697.50},
    {"min": 15750, "max": 16249.99, "ee": 720},
    {"min": 16250, "max": 16749.99, "ee": 742.50},
    {"min": 16750, "max": 17249.99, "ee": 765},
    {"min": 17250, "max": 17749.99, "ee": 787.50},
    {"min": 17750, "max": 18249.99, "ee": 810},
    {"min": 18250, "max": 18749.99, "ee": 832.50},
    {"min": 18750, "max": 19249.99, "ee": 855},
    {"min": 19250, "max": 19749.99, "ee": 877.50},
    {"min": 19750, "max": 20249.99, "ee": 900},
    {"min": 20250, "max": 20749.99, "ee": 922.50},
    {"min": 20750, "max": 21249.99, "ee": 945},
    {"min": 21250, "max": 21749.99, "ee": 967.50},
    {"min": 21750, "max": 22249.99, "ee": 990},
    {"min": 22250, "max": 22749.99, "ee": 1012.50},
    {"min": 22750, "max": 23249.99, "ee": 1035},
    {"min": 23250, "max": 23749.99, "ee": 1057.50},
    {"min": 23750, "max": 24249.99, "ee": 1080},
    {"min": 24250, "max": 24749.99, "ee": 1102.50},
    {"min": 24750, "max": 25249.99, "ee": 1125},
    {"min": 25250, "max": 25749.99, "ee": 1147.50},
    {"min": 25750, "max": 26249.99, "ee": 1170},
    {"min": 26250, "max": 26749.99, "ee": 1192.50},
    {"min": 26750, "max": 27249.99, "ee": 1215},
    {"min": 27250, "max": 27749.99, "ee": 1237.50},
    {"min": 27750, "max": 28249.99, "ee": 1260},
    {"min": 28250, "max": 28749.99, "ee": 1282.50},
    {"min": 28750, "max": 29249.99, "ee": 1305},
    {"min": 29250, "max": 29749.99, "ee": 1327.50},
    {"min": 29750, "max": 999999, "ee": 1350},
]


def get_contribution_table(db: Session, contribution_type: ContributionType, year: int = None) -> Optional[ContributionTable]:
    """
    Get the active contribution table for a given type and year.
    If no year specified, uses current year.
    Falls back to most recent year if current year not found.
    """
    if year is None:
        year = date.today().year

    # Try to get table for specified year
    table = db.query(ContributionTable).filter(
        ContributionTable.contribution_type == contribution_type,
        ContributionTable.effective_year == year,
        ContributionTable.is_active == True
    ).first()

    if table:
        return table

    # Fall back to most recent year
    table = db.query(ContributionTable).filter(
        ContributionTable.contribution_type == contribution_type,
        ContributionTable.is_active == True
    ).order_by(ContributionTable.effective_year.desc()).first()

    return table


def calculate_sss_from_db(db: Session, monthly_salary: float, year: int = None) -> float:
    """
    Calculate SSS employee contribution using database table.
    Falls back to hardcoded 2024 table if no DB table found.
    """
    table = get_contribution_table(db, ContributionType.SSS, year)

    if table and table.brackets:
        brackets = table.brackets
        for bracket in brackets:
            if bracket["min"] <= monthly_salary <= bracket["max"]:
                return bracket["ee"]
        # Return maximum from last bracket
        if brackets:
            return brackets[-1]["ee"]

    # Fallback to hardcoded table
    return calculate_sss(monthly_salary)


def calculate_sss(monthly_salary: float) -> float:
    """Calculate SSS employee contribution based on 2024 table (fallback)."""
    for bracket in SSS_TABLE_2024:
        if bracket["min"] <= monthly_salary <= bracket["max"]:
            return bracket["ee"]
    return 1350  # Maximum


def calculate_philhealth_from_db(db: Session, monthly_salary: float, year: int = None) -> float:
    """
    Calculate PhilHealth employee contribution using database table.
    Falls back to hardcoded calculation if no DB table found.
    """
    table = get_contribution_table(db, ContributionType.PHILHEALTH, year)

    if table and table.brackets:
        config = table.brackets
        rate = config.get("rate", 0.05)
        employee_share = config.get("employee_share_percent", 0.5)
        min_premium = config.get("min_monthly_premium", 500)
        max_premium = config.get("max_monthly_premium", 5000)

        total = monthly_salary * rate
        total = max(min_premium, min(total, max_premium))
        return round(total * employee_share, 2)

    # Fallback to hardcoded calculation
    return calculate_philhealth(monthly_salary)


def calculate_philhealth(monthly_salary: float) -> float:
    """
    Calculate PhilHealth employee contribution (fallback).
    2024: 5% of monthly basic salary, shared equally (2.5% each).
    Min: PHP 500, Max: PHP 5,000 (total), employee share is half.
    """
    total = monthly_salary * 0.05
    total = max(500, min(total, 5000))
    return round(total / 2, 2)


def calculate_pagibig_from_db(db: Session, monthly_salary: float, year: int = None) -> float:
    """
    Calculate Pag-IBIG employee contribution using database table.
    Falls back to hardcoded calculation if no DB table found.
    """
    table = get_contribution_table(db, ContributionType.PAGIBIG, year)

    if table and table.brackets:
        config = table.brackets
        rate_below_1500 = config.get("employee_rate_below_1500", 0.01)
        rate_above_1500 = config.get("employee_rate_above_1500", 0.02)
        max_contribution = config.get("max_employee_contribution", 200)

        if monthly_salary <= 1500:
            contribution = monthly_salary * rate_below_1500
        else:
            contribution = monthly_salary * rate_above_1500

        return min(round(contribution, 2), max_contribution)

    # Fallback to hardcoded calculation
    return calculate_pagibig(monthly_salary)


def calculate_pagibig(monthly_salary: float) -> float:
    """
    Calculate Pag-IBIG employee contribution (fallback).
    2% of monthly salary, max PHP 200.
    """
    contribution = monthly_salary * 0.02
    return min(round(contribution, 2), 200)


def get_employee_loan_deductions(db: Session, employee_id: int) -> Dict[str, Any]:
    """
    Get active loans and total monthly deductions for an employee.
    Returns breakdown by loan type for payslip transparency.
    Separates SSS loans and Pag-IBIG loans for proper display.
    """
    from sqlalchemy import func

    active_loans = db.query(Loan).filter(
        Loan.employee_id == employee_id,
        Loan.status == LoanStatus.ACTIVE,
        Loan.remaining_balance > 0
    ).all()

    total_deduction = 0.0
    sss_loan_total = 0.0
    pagibig_loan_total = 0.0
    other_loan_total = 0.0
    loan_breakdown = []

    for loan in active_loans:
        monthly = float(loan.monthly_deduction or 0)
        remaining = float(loan.remaining_balance or 0)

        # Don't deduct more than remaining balance
        actual_deduction = min(monthly, remaining)

        if actual_deduction > 0:
            loan_type_code = loan.loan_type_config.code if loan.loan_type_config else 'other'

            loan_breakdown.append({
                'loan_id': loan.id,
                'loan_type_id': loan.loan_type_id,
                'loan_type_code': loan_type_code,
                'reference_no': loan.reference_no,
                'monthly_deduction': monthly,
                'actual_deduction': actual_deduction,
                'remaining_balance': remaining,
            })
            total_deduction += actual_deduction

            # Categorize by loan type for separate display
            if loan_type_code in ('sss', 'sss_calamity'):
                sss_loan_total += actual_deduction
            elif loan_type_code in ('pagibig', 'pagibig_calamity'):
                pagibig_loan_total += actual_deduction
            else:
                other_loan_total += actual_deduction

    return {
        'total': round(total_deduction, 2),
        'sss_loan': round(sss_loan_total, 2),
        'pagibig_loan': round(pagibig_loan_total, 2),
        'other_loan': round(other_loan_total, 2),
        'loans': loan_breakdown,
        'loan_count': len(loan_breakdown),
    }


def record_loan_deductions(
    db: Session,
    employee_id: int,
    payslip_id: int,
    deduction_date: date
) -> float:
    """
    Record loan deductions for a payslip and update loan balances.
    Returns total amount deducted.
    """
    active_loans = db.query(Loan).filter(
        Loan.employee_id == employee_id,
        Loan.status == LoanStatus.ACTIVE,
        Loan.remaining_balance > 0
    ).all()

    total_deducted = 0.0

    for loan in active_loans:
        monthly = float(loan.monthly_deduction or 0)
        remaining = float(loan.remaining_balance or 0)

        # Don't deduct more than remaining balance
        actual_deduction = min(monthly, remaining)

        if actual_deduction > 0:
            balance_after = remaining - actual_deduction

            # Create loan deduction record
            loan_deduction = LoanDeduction(
                loan_id=loan.id,
                payslip_id=payslip_id,
                amount=actual_deduction,
                balance_before=remaining,
                balance_after=balance_after,
                deduction_date=deduction_date,
                notes=f"Auto-deducted from payslip #{payslip_id}"
            )
            db.add(loan_deduction)

            # Update loan balance
            loan.remaining_balance = balance_after
            loan.total_paid = float(loan.total_paid or 0) + actual_deduction

            # Check if loan is fully paid
            if balance_after <= 0:
                loan.status = LoanStatus.PAID
                loan.actual_end_date = deduction_date

            total_deducted += actual_deduction

    return round(total_deducted, 2)


def calculate_bir_withholding_tax(monthly_taxable: float) -> dict:
    """
    Calculate withholding tax based on BIR TRAIN Law 2023-2026 brackets.

    Monthly Tax Brackets (2023-2026):
    - ₱0 - ₱20,833: Exempt
    - Over ₱20,833 - ₱33,333: (Excess over ₱20,833) × 15%
    - Over ₱33,333 - ₱66,667: ₱1,875 + (Excess over ₱33,333) × 20%
    - Over ₱66,667 - ₱166,667: ₱8,541.80 + (Excess over ₱66,667) × 25%
    - Over ₱166,667 - ₱666,667: ₱33,541.80 + (Excess over ₱166,667) × 30%
    - Over ₱666,667: ₱183,541.80 + (Excess over ₱666,667) × 35%

    Args:
        monthly_taxable: Monthly taxable income (gross - SSS - PhilHealth - Pag-IBIG)

    Returns:
        dict with monthly_tax, semi_monthly_tax, bracket info
    """
    if monthly_taxable <= 20833:
        monthly_tax = 0
        bracket = "Exempt (≤₱20,833)"
        rate = 0
    elif monthly_taxable <= 33333:
        excess = monthly_taxable - 20833
        monthly_tax = round(excess * 0.15, 2)
        bracket = "₱20,833 - ₱33,333"
        rate = 15
    elif monthly_taxable <= 66667:
        excess = monthly_taxable - 33333
        monthly_tax = round(1875 + (excess * 0.20), 2)
        bracket = "₱33,333 - ₱66,667"
        rate = 20
    elif monthly_taxable <= 166667:
        excess = monthly_taxable - 66667
        monthly_tax = round(8541.80 + (excess * 0.25), 2)
        bracket = "₱66,667 - ₱166,667"
        rate = 25
    elif monthly_taxable <= 666667:
        excess = monthly_taxable - 166667
        monthly_tax = round(33541.80 + (excess * 0.30), 2)
        bracket = "₱166,667 - ₱666,667"
        rate = 30
    else:
        excess = monthly_taxable - 666667
        monthly_tax = round(183541.80 + (excess * 0.35), 2)
        bracket = "Over ₱666,667"
        rate = 35

    return {
        "monthly_taxable_income": round(monthly_taxable, 2),
        "monthly_tax": monthly_tax,
        "semi_monthly_tax": round(monthly_tax / 2, 2),
        "bracket": bracket,
        "rate": rate
    }


def calculate_tax(monthly_taxable: float) -> float:
    """
    Calculate withholding tax based on BIR TRAIN Law 2023-2026.
    Returns the MONTHLY tax amount.
    """
    result = calculate_bir_withholding_tax(monthly_taxable)
    return result["monthly_tax"]


def calculate_ican_daily_rate(monthly_salary: float, working_days_per_year: int = 261) -> float:
    """
    Calculate daily rate using ICAN formula.

    ICAN Policy: Daily Rate = Monthly Salary × 12 months ÷ 261 days

    Args:
        monthly_salary: Employee's monthly basic salary
        working_days_per_year: Working days per year (default: 261)

    Returns:
        Daily rate in PHP
    """
    if monthly_salary <= 0:
        return 0.0
    return round((monthly_salary * 12) / working_days_per_year, 2)


def calculate_ican_minute_rate(daily_rate: float, work_hours_per_day: float = 8) -> float:
    """
    Calculate minute rate using ICAN formula.

    ICAN Policy: Minute Rate = Daily Rate ÷ Hours worked per day ÷ 60 minutes

    Args:
        daily_rate: Calculated daily rate
        work_hours_per_day: Hours worked per day (default: 8)

    Returns:
        Minute rate in PHP
    """
    if daily_rate <= 0 or work_hours_per_day <= 0:
        return 0.0
    return round(daily_rate / work_hours_per_day / 60, 4)


def get_payroll_settings(db: Session) -> PayrollSettings:
    """Get payroll settings, creating defaults if needed."""
    settings = db.query(PayrollSettings).first()
    if not settings:
        settings = PayrollSettings(
            absent_rate_per_day=0,
            late_rate_per_minute=0,
            late_rate_per_incident=0,
            undertime_rate_per_minute=0,
            late_grace_minutes=15,
            default_sss=0,
            default_philhealth=0,
            default_pagibig=0,
            default_tax=0,
            overtime_rate=1.30,
            night_diff_rate=1.10,
            holiday_rate=2.00,
            special_holiday_rate=1.30,
            work_hours_per_day=8,
            work_days_per_month=22,
            # ICAN Formula Settings (enabled by default)
            use_ican_formula=True,
            working_days_per_year=261
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def get_attendance_summary(
    db: Session,
    employee_id: int,
    period_start: date,
    period_end: date,
    employee: Employee = None
) -> Dict[str, Any]:
    """
    Get attendance summary for the payroll period.
    First checks ProcessedAttendance, then falls back to ImportRecord data.
    Uses employee's working days schedule to determine absences.
    """
    # Helper to check if employee works on a specific weekday
    def employee_works_on_weekday(weekday: int) -> bool:
        """Check if employee works on a weekday (0=Mon, 6=Sun)."""
        if not employee:
            # Default to Mon-Fri if no employee object
            return weekday < 5

        day_map = {
            0: getattr(employee, 'work_monday', True),
            1: getattr(employee, 'work_tuesday', True),
            2: getattr(employee, 'work_wednesday', True),
            3: getattr(employee, 'work_thursday', True),
            4: getattr(employee, 'work_friday', True),
            5: getattr(employee, 'work_saturday', False),
            6: getattr(employee, 'work_sunday', False),
        }
        return day_map.get(weekday, False) or False

    # Try ProcessedAttendance first
    records = db.query(ProcessedAttendance).filter(
        ProcessedAttendance.employee_id == employee_id,
        ProcessedAttendance.date >= period_start,
        ProcessedAttendance.date <= period_end
    ).all()

    total_worked_minutes = 0
    total_late_minutes = 0
    total_ot_minutes = 0
    total_undertime_minutes = 0
    days_worked = 0
    days_absent = 0
    late_count = 0
    # Holiday tracking
    regular_holiday_worked = 0  # Days employee worked on a Regular Holiday
    regular_holiday_not_worked = 0  # Days employee didn't work on a Regular Holiday (still gets paid)
    snwh_worked = 0  # Days employee worked on SNWH

    # Build holiday lookup for the period
    from app.models.holiday import Holiday
    holidays_in_period = db.query(Holiday).filter(
        Holiday.date >= period_start,
        Holiday.date <= period_end,
        Holiday.is_active == True
    ).all()
    holiday_map = {}
    for h in holidays_in_period:
        holiday_map[h.date] = h.holiday_type.value if h.holiday_type else 'special'

    if records:
        # Use ProcessedAttendance
        for record in records:
            record_holiday_type = holiday_map.get(record.date)

            if record.worked_minutes and record.worked_minutes > 0:
                total_worked_minutes += record.worked_minutes
                days_worked += 1
                # Track holidays worked
                if record_holiday_type == 'regular':
                    regular_holiday_worked += 1
                elif record_holiday_type in ('special', 'special_working'):
                    snwh_worked += 1
            elif record.status == AttendanceStatus.ABSENT:
                # If absent on a regular holiday, still gets paid (PH law)
                if record_holiday_type == 'regular':
                    regular_holiday_not_worked += 1
                else:
                    days_absent += 1
            elif record.status == AttendanceStatus.HOLIDAY:
                # Explicitly marked as holiday
                if record_holiday_type == 'regular':
                    regular_holiday_not_worked += 1
                # SNWH not worked = no pay (unless company policy says otherwise)
            elif employee_works_on_weekday(record.date.weekday()):
                # Employee should have worked this day but didn't
                if record_holiday_type == 'regular':
                    regular_holiday_not_worked += 1
                else:
                    days_absent += 1
            # Note: If employee doesn't work this day, it's not counted as absent

            if hasattr(record, 'late_minutes') and record.late_minutes and record.late_minutes > 0:
                total_late_minutes += record.late_minutes
                late_count += 1

            if hasattr(record, 'overtime_minutes') and record.overtime_minutes and record.overtime_minutes > 0:
                total_ot_minutes += record.overtime_minutes

            if hasattr(record, 'undertime_minutes') and record.undertime_minutes and record.undertime_minutes > 0:
                total_undertime_minutes += record.undertime_minutes
    else:
        # Fall back to ImportRecord (from imported attendance files)
        # Match by employee name instead of biometric_id
        if employee:
            # Build name patterns to search for
            emp_full_name = f"{employee.first_name} {employee.last_name}".lower()
            emp_name_parts = [employee.first_name.lower(), employee.last_name.lower()]

            import_records = db.query(ImportRecord).join(ImportBatch).filter(
                ImportRecord.date >= period_start,
                ImportRecord.date <= period_end
            ).all()

            # Filter by name matching
            matched_records = []
            for rec in import_records:
                if rec.employee_name:
                    rec_name = rec.employee_name.lower()
                    # Check if all name parts are in the record name
                    if all(part in rec_name for part in emp_name_parts):
                        matched_records.append(rec)
            import_records = matched_records

            for record in import_records:
                # Parse hours.minutes format to minutes
                if record.worked_minutes and record.worked_minutes > 0:
                    total_worked_minutes += record.worked_minutes
                    days_worked += 1
                elif record.status in ['absent', 'ABSENT']:
                    days_absent += 1

                # Check for late status
                if record.status and 'late' in record.status.lower():
                    late_count += 1

    return {
        'days_worked': days_worked,
        'days_absent': days_absent,
        'late_count': late_count,
        'total_late_minutes': total_late_minutes,
        'total_late_hours': round(total_late_minutes / 60, 2),
        'total_ot_hours': round(total_ot_minutes / 60, 2),
        'total_undertime_minutes': total_undertime_minutes,
        # Holiday data
        'regular_holiday_worked': regular_holiday_worked,
        'regular_holiday_not_worked': regular_holiday_not_worked,
        'snwh_worked': snwh_worked,
    }


def generate_payslip(
    db: Session,
    employee: Employee,
    payroll_run: PayrollRun,
    attendance: Dict[str, Any],
    settings: PayrollSettings = None
) -> Payslip:
    """
    Generate payslip for an employee.
    Semi-monthly = Monthly / 2
    Uses PayrollSettings for universal deduction rates.
    Uses employee-specific government contributions if set, else defaults.
    """
    cutoff = getattr(payroll_run, 'cutoff', 1) or 1

    # Get payroll settings
    if not settings:
        settings = get_payroll_settings(db)

    # Get employee rates
    monthly_basic = float(employee.basic_salary or 0)
    daily_rate = float(employee.daily_rate or 0)
    hourly_rate = float(employee.hourly_rate or 0)
    monthly_allowance = float(getattr(employee, 'allowance', 0) or 0)
    monthly_productivity = float(getattr(employee, 'productivity_incentive', 0) or 0)
    monthly_language = float(getattr(employee, 'language_incentive', 0) or 0)

    # Get settings for deduction calculation
    use_ican_formula = getattr(settings, 'use_ican_formula', True)
    working_days_per_year = int(getattr(settings, 'working_days_per_year', 261) or 261)
    # Use employee's work hours if set, otherwise use settings default
    work_hours_per_day = float(employee.work_hours_per_day or settings.work_hours_per_day or 8)

    # Get universal deduction rates from settings (fallback if not using ICAN formula)
    absent_rate_per_day = float(settings.absent_rate_per_day or 0)
    late_rate_per_minute = float(settings.late_rate_per_minute or 0)
    late_rate_per_incident = float(settings.late_rate_per_incident or 0)
    undertime_rate_per_minute = float(settings.undertime_rate_per_minute or 0)

    # Calculate ICAN rates if using ICAN formula
    ican_daily_rate = 0.0
    ican_minute_rate = 0.0
    if use_ican_formula and monthly_basic > 0:
        # ICAN Formula: Daily Rate = Monthly Salary × 12 ÷ 261
        ican_daily_rate = calculate_ican_daily_rate(monthly_basic, working_days_per_year)
        # ICAN Formula: Minute Rate = Daily Rate ÷ Hours per day ÷ 60
        ican_minute_rate = calculate_ican_minute_rate(ican_daily_rate, work_hours_per_day)

    # Get allowance calculation mode from settings
    allowance_calc_mode = getattr(settings, 'allowance_calculation_mode', 'fixed') or 'fixed'

    # Calculate working days in cutoff period (for daily calculation)
    # Count actual working days between period_start and period_end based on employee's schedule
    from datetime import timedelta
    working_days_in_cutoff = 0
    current_date = payroll_run.period_start
    while current_date <= payroll_run.period_end:
        weekday = current_date.weekday()
        # Check if employee works on this weekday
        day_map = {
            0: getattr(employee, 'work_monday', True),
            1: getattr(employee, 'work_tuesday', True),
            2: getattr(employee, 'work_wednesday', True),
            3: getattr(employee, 'work_thursday', True),
            4: getattr(employee, 'work_friday', True),
            5: getattr(employee, 'work_saturday', False),
            6: getattr(employee, 'work_sunday', False),
        }
        if day_map.get(weekday, False):
            working_days_in_cutoff += 1
        current_date += timedelta(days=1)

    # Default to 11 if no working days found (shouldn't happen)
    if working_days_in_cutoff == 0:
        working_days_in_cutoff = 11

    # Calculate daily rates for allowances/incentives using ICAN formula
    # Daily Rate = Monthly × 12 ÷ 261 (same formula as salary)
    daily_allowance = round(monthly_allowance * 12 / 261, 2) if monthly_allowance > 0 else 0
    daily_productivity = round(monthly_productivity * 12 / 261, 2) if monthly_productivity > 0 else 0
    daily_language = round(monthly_language * 12 / 261, 2) if monthly_language > 0 else 0

    # Determine if we should use daily calculation for THIS payslip
    # Priority: payslip override > global setting
    # Note: use_daily_allowance will be set later when creating the payslip,
    # but for initial calculation we use the global setting
    days_worked = attendance['days_worked']

    use_daily_calc = False
    if allowance_calc_mode == 'daily_always':
        use_daily_calc = True
    elif allowance_calc_mode == 'daily_partial':
        # Only use daily if days worked is less than expected
        if days_worked < working_days_in_cutoff:
            use_daily_calc = True

    # Calculate semi-monthly amounts based on mode
    basic_semi = round(monthly_basic / 2, 2)

    if use_daily_calc:
        # Daily calculation: daily_rate × days_worked
        allowance_semi = round(daily_allowance * days_worked, 2)
        productivity_semi = round(daily_productivity * days_worked, 2)
        language_semi = round(daily_language * days_worked, 2)
    else:
        # Static: use employee's allowance/incentive values as-is (not divided)
        allowance_semi = round(monthly_allowance, 2)
        productivity_semi = round(monthly_productivity, 2)
        language_semi = round(monthly_language, 2)

    # Calculate deductions for absences
    # Priority: ICAN formula > universal rate from settings > employee daily_rate
    # Skip fallback rates when ICAN is enabled but employee has no salary (prevents negative net pay)
    absent_amount = 0
    effective_daily_rate = 0.0
    has_salary = monthly_basic > 0
    if attendance['days_absent'] > 0:
        if use_ican_formula and ican_daily_rate > 0:
            # Use ICAN formula: Daily Rate = Monthly Salary × 12 ÷ 261
            effective_daily_rate = ican_daily_rate
            absent_amount = round(ican_daily_rate * attendance['days_absent'], 2)
        elif not use_ican_formula and absent_rate_per_day > 0:
            # Only use universal fallback when ICAN formula is disabled
            effective_daily_rate = absent_rate_per_day
            absent_amount = round(absent_rate_per_day * attendance['days_absent'], 2)
        elif has_salary and daily_rate > 0:
            effective_daily_rate = daily_rate
            absent_amount = round(daily_rate * attendance['days_absent'], 2)

    # Calculate late deductions (Tardiness)
    # Priority: ICAN minute rate > per-minute setting > per-incident > hourly rate fallback
    # If employee is_flexible, skip late deductions entirely
    # Skip fallback rates when ICAN is enabled but employee has no salary
    late_amount = 0
    total_late_minutes = attendance['total_late_minutes']
    late_count = attendance['late_count']
    effective_minute_rate = 0.0

    # Flexible employees have no late deductions
    is_flexible = getattr(employee, 'is_flexible', False) or False
    if is_flexible:
        total_late_minutes = 0
        late_count = 0

    if use_ican_formula and ican_minute_rate > 0 and total_late_minutes > 0:
        # Use ICAN formula: Minute Rate = Daily Rate ÷ Hours per day ÷ 60
        effective_minute_rate = ican_minute_rate
        late_amount = round(ican_minute_rate * total_late_minutes, 2)
    elif not use_ican_formula and late_rate_per_minute > 0 and total_late_minutes > 0:
        effective_minute_rate = late_rate_per_minute
        late_amount = round(late_rate_per_minute * total_late_minutes, 2)
    elif not use_ican_formula and late_rate_per_incident > 0 and late_count > 0:
        late_amount = round(late_rate_per_incident * late_count, 2)
    elif has_salary and hourly_rate > 0 and attendance['total_late_hours'] > 0:
        late_amount = round(hourly_rate * attendance['total_late_hours'], 2)

    # Calculate undertime deduction
    # Priority: ICAN minute rate > undertime setting rate
    undertime_amount = 0
    total_undertime = attendance.get('total_undertime_minutes', 0)
    if use_ican_formula and ican_minute_rate > 0 and total_undertime > 0:
        # Use ICAN formula: same minute rate as tardiness
        undertime_amount = round(ican_minute_rate * total_undertime, 2)
    elif not use_ican_formula and undertime_rate_per_minute > 0 and total_undertime > 0:
        undertime_amount = round(undertime_rate_per_minute * total_undertime, 2)

    # Calculate basic pay based on days worked (for manual/seasonal employees)
    days_worked = attendance['days_worked']
    daily_rate_for_calc = ican_daily_rate if use_ican_formula and ican_daily_rate > 0 else daily_rate
    daily_based_basic = round(daily_rate_for_calc * days_worked, 2)

    # Calculate holiday pay (Philippine Labor Law + company settings)
    # Regular Holiday (worked): 200% of daily rate (100% already in basic + 100% premium)
    # Regular Holiday (not worked): 100% of daily rate (paid even if not worked)
    # SNWH (worked): 130% of daily rate (100% already in basic + 30% premium)
    # SNWH (not worked): No pay by law (but company may give flat bonus)
    rh_worked = attendance.get('regular_holiday_worked', 0)
    rh_not_worked = attendance.get('regular_holiday_not_worked', 0)
    snwh_worked_count = attendance.get('snwh_worked', 0)

    holiday_rate = float(getattr(settings, 'holiday_rate', 2.00) or 2.00)
    special_holiday_rate = float(getattr(settings, 'special_holiday_rate', 1.30) or 1.30)
    rh_bonus = float(getattr(settings, 'regular_holiday_bonus', 0) or 0)
    snwh_bonus = float(getattr(settings, 'snwh_bonus', 0) or 0)

    # Regular Holiday pay: premium portion only (100% is already in basic salary)
    # If worked: (holiday_rate - 1.0) × daily_rate × days + flat bonus per day
    # If not worked: 1.0 × daily_rate (ensures they get paid for that day)
    regular_holiday_pay = 0
    if daily_rate_for_calc > 0:
        if rh_worked > 0:
            regular_holiday_pay += round((holiday_rate - 1.0) * daily_rate_for_calc * rh_worked, 2)
            regular_holiday_pay += round(rh_bonus * rh_worked, 2)
        if rh_not_worked > 0:
            # Employee gets daily rate even though they didn't work
            regular_holiday_pay += round(daily_rate_for_calc * rh_not_worked, 2)

    # SNWH pay: premium portion (30% of daily rate) + flat bonus
    snwh_pay = 0
    if daily_rate_for_calc > 0 and snwh_worked_count > 0:
        snwh_pay = round((special_holiday_rate - 1.0) * daily_rate_for_calc * snwh_worked_count, 2)
        snwh_pay += round(snwh_bonus * snwh_worked_count, 2)

    # Build earnings (all adjustable by HR)
    earnings = {
        # Semi-monthly breakdown (default calculation)
        'basic_semi': basic_semi,
        'allowance_semi': allowance_semi,
        'productivity_incentive_semi': productivity_semi,
        'language_incentive_semi': language_semi,
        # Daily-based calculation (for seasonal/part-time employees)
        'daily_rate': daily_rate_for_calc,
        'days_worked': days_worked,
        'daily_based_basic': daily_based_basic,  # Daily rate × Days worked
        # Holiday pay (auto-calculated from attendance + settings, adjustable by HR)
        'regular_holiday': regular_holiday_pay,
        'regular_holiday_ot': 0,
        'snwh': snwh_pay,  # Special Non-Working Holiday
        'snwh_ot': 0,  # SNWH Overtime
        'overtime': 0,  # Auto-computed below, adjustable by HR
        # Calculation reference (for transparency)
        '_calculation_info': {
            'monthly_basic': monthly_basic,
            'use_ican_formula': use_ican_formula,
            'working_days_per_year': working_days_per_year,
            'work_hours_per_day': work_hours_per_day,
            'ican_daily_rate': ican_daily_rate,  # Monthly × 12 ÷ 261
            'ican_minute_rate': ican_minute_rate,  # Daily Rate ÷ Hours ÷ 60
            'employee_working_days_per_week': getattr(employee, 'working_days_per_week', 5),
            # Allowance calculation info
            'allowance_calc_mode': allowance_calc_mode,
            'use_daily_allowance': use_daily_calc,
            'working_days_in_cutoff': working_days_in_cutoff,
            'daily_allowance_rate': daily_allowance,
            'daily_productivity_rate': daily_productivity,
            'daily_language_rate': daily_language,
            'monthly_allowance': monthly_allowance,
            'monthly_productivity': monthly_productivity,
            'monthly_language': monthly_language,
            # Holiday info
            'regular_holiday_worked': rh_worked,
            'regular_holiday_not_worked': rh_not_worked,
            'snwh_worked': snwh_worked_count,
            'holiday_rate': holiday_rate,
            'special_holiday_rate': special_holiday_rate,
            'rh_bonus_per_day': rh_bonus,
            'snwh_bonus_per_day': snwh_bonus,
        }
    }

    # Auto-compute OT pay: (Daily Rate / Work Hours) × OT Rate × OT Hours
    total_ot_hours = float(attendance.get('total_ot_hours', 0) or 0)
    ot_rate_multiplier = float(getattr(settings, 'overtime_rate', 1.30) or 1.30)
    ot_hourly_rate = (ican_daily_rate / work_hours_per_day) if (ican_daily_rate > 0 and work_hours_per_day > 0) else 0
    ot_pay = round(ot_hourly_rate * ot_rate_multiplier * total_ot_hours, 2)
    earnings['overtime'] = ot_pay
    earnings['_calculation_info']['ot_hourly_rate'] = round(ot_hourly_rate, 4)
    earnings['_calculation_info']['ot_rate_multiplier'] = ot_rate_multiplier
    earnings['_calculation_info']['ot_hours'] = total_ot_hours

    total_earnings = basic_semi + allowance_semi + productivity_semi + language_semi + regular_holiday_pay + snwh_pay + ot_pay

    # Build deductions based on cutoff
    deductions = {
        'absences_days': attendance['days_absent'],
        'absences_amount': absent_amount,
        'absences_daily_rate_used': effective_daily_rate,  # Rate used for absence deduction
        'late_hours': round(total_late_minutes / 60, 2),
        'late_minutes': total_late_minutes,
        'late_amount': late_amount,
        'late_minute_rate_used': effective_minute_rate,  # Rate used for late deduction
        'work_hours_per_day_used': work_hours_per_day,  # Employee's work hours used in calculation
        'undertime_minutes': total_undertime,
        'undertime_amount': undertime_amount,
    }

    # Get employee-specific government contributions or use defaults/calculated values
    # Note: We check "is not None" to allow explicit 0 values
    emp_sss = float(employee.sss_contribution) if hasattr(employee, 'sss_contribution') and employee.sss_contribution is not None else None
    emp_philhealth = float(employee.philhealth_contribution) if hasattr(employee, 'philhealth_contribution') and employee.philhealth_contribution is not None else None
    emp_pagibig = float(employee.pagibig_contribution) if hasattr(employee, 'pagibig_contribution') and employee.pagibig_contribution is not None else None
    emp_tax = float(employee.tax_amount) if hasattr(employee, 'tax_amount') and employee.tax_amount is not None else None

    # Default contributions from settings
    default_sss = float(settings.default_sss or 0)
    default_philhealth = float(settings.default_philhealth or 0)
    default_pagibig = float(settings.default_pagibig or 0)
    default_tax = float(settings.default_tax or 0)

    # Get employee loan deductions
    loan_info = get_employee_loan_deductions(db, employee.id)
    loan_deduction_total = loan_info['total']

    # Calculate monthly government contributions for tax computation
    # (Even though SSS/PhilHealth/Pag-IBIG are only deducted in 2nd cutoff,
    # we need the monthly amounts to compute taxable income for BIR tax)
    if emp_sss is not None:
        monthly_sss = emp_sss
    elif default_sss is not None and default_sss > 0:
        monthly_sss = default_sss
    else:
        monthly_sss = calculate_sss_from_db(db, monthly_basic)

    if emp_philhealth is not None:
        monthly_philhealth = emp_philhealth
    elif default_philhealth is not None and default_philhealth > 0:
        monthly_philhealth = default_philhealth
    else:
        monthly_philhealth = calculate_philhealth_from_db(db, monthly_basic)

    if emp_pagibig is not None:
        monthly_pagibig = emp_pagibig
    elif default_pagibig is not None and default_pagibig > 0:
        monthly_pagibig = default_pagibig
    else:
        monthly_pagibig = calculate_pagibig_from_db(db, monthly_basic)

    # Calculate BIR Taxable Income = Gross Monthly - SSS - PhilHealth - Pag-IBIG
    # Gross includes basic salary + taxable allowances (productivity, language incentives)
    gross_monthly = monthly_basic + float(employee.allowance or 0) + float(employee.productivity_incentive or 0) + float(employee.language_incentive or 0)
    monthly_taxable_income = gross_monthly - monthly_sss - monthly_philhealth - monthly_pagibig

    # Calculate BIR withholding tax
    tax_computation = calculate_bir_withholding_tax(monthly_taxable_income)

    # Deductions based on cutoff
    # 1st cutoff: absences, lates, loans, tax (NO government benefits)
    # 2nd cutoff: absences, lates, tax, SSS, PhilHealth, Pag-IBIG (NO loans)
    if cutoff == 1:
        # 1st cutoff: absences, lates, loans, tax (NO gov benefits)
        if emp_tax is not None:
            tax_semi = round(emp_tax / 2, 2)
        elif default_tax > 0:
            tax_semi = round(default_tax / 2, 2)
        else:
            # Auto-calculate using BIR formula
            tax_semi = tax_computation["semi_monthly_tax"]

        deductions['tax'] = tax_semi
        deductions['tax_computation'] = tax_computation  # Store computation details
        deductions['sss_loan'] = loan_info.get('sss_loan', 0)  # SSS loans (regular + calamity)
        deductions['pagibig_loan'] = loan_info.get('pagibig_loan', 0)  # Pag-IBIG loans (regular + calamity)
        deductions['other_loan'] = loan_info.get('other_loan', 0)  # Company, cash advance, other loans
        deductions['loans'] = loan_deduction_total  # Legacy field - total of all loans
        deductions['loans_breakdown'] = loan_info['loans']  # Detailed breakdown
        deductions['sss'] = 0
        deductions['philhealth'] = 0
        deductions['pagibig'] = 0
    else:
        # 2nd cutoff: absences, lates, tax, SSS, PhilHealth, Pag-IBIG (NO loans)
        deductions['sss'] = monthly_sss
        deductions['philhealth'] = monthly_philhealth
        deductions['pagibig'] = monthly_pagibig

        if emp_tax is not None:
            deductions['tax'] = round(emp_tax / 2, 2)
        elif default_tax > 0:
            deductions['tax'] = round(default_tax / 2, 2)
        else:
            # Auto-calculate using BIR formula
            deductions['tax'] = tax_computation["semi_monthly_tax"]

        deductions['tax_computation'] = tax_computation  # Store computation details

        # NO loans in 2nd cutoff
        deductions['sss_loan'] = 0
        deductions['pagibig_loan'] = 0
        deductions['other_loan'] = 0
        deductions['loans'] = 0
        deductions['loans_breakdown'] = []

    # Calculate totals based on cutoff
    # 1st cutoff: absences, lates, loans (SSS + Pag-IBIG), tax (NO government contributions)
    # 2nd cutoff: absences, lates, tax, SSS, PhilHealth, Pag-IBIG (NO loans)
    if cutoff == 1:
        # 1st cutoff: absences, lates, undertime, loans (SSS, Pag-IBIG, other), tax (NO gov contributions)
        total_deductions = (
            deductions['absences_amount'] +
            deductions['late_amount'] +
            deductions.get('undertime_amount', 0) +
            deductions.get('tax', 0) +
            deductions.get('sss_loan', 0) +
            deductions.get('pagibig_loan', 0) +
            deductions.get('other_loan', 0)
        )
    else:
        # 2nd cutoff: absences, lates, undertime, tax, SSS, PhilHealth, Pag-IBIG (NO loans)
        total_deductions = (
            deductions['absences_amount'] +
            deductions['late_amount'] +
            deductions.get('undertime_amount', 0) +
            deductions.get('sss', 0) +
            deductions.get('philhealth', 0) +
            deductions.get('pagibig', 0) +
            deductions.get('tax', 0)
        )

    net_pay = total_earnings - total_deductions

    # Create payslip
    # Note: For flexible employees, late_count and total_late_minutes are zeroed out above
    payslip = Payslip(
        payroll_run_id=payroll_run.id,
        employee_id=employee.id,
        earnings=earnings,
        deductions=deductions,
        total_earnings=round(total_earnings, 2),
        total_deductions=round(total_deductions, 2),
        net_pay=round(net_pay, 2),
        days_worked=attendance['days_worked'],
        days_absent=attendance['days_absent'],
        late_count=late_count,  # Use local variable (0 for flexible employees)
        total_late_minutes=total_late_minutes,  # Use local variable (0 for flexible employees)
        overtime_hours=attendance['total_ot_hours'],
        undertime_minutes=total_undertime,
        absent_deduction=absent_amount,
        late_deduction=late_amount,
        undertime_deduction=undertime_amount,
        # Allowance calculation mode used (for this payslip)
        use_daily_allowance=use_daily_calc if use_daily_calc else None,
    )

    return payslip


def process_payroll(db: Session, payroll_run: PayrollRun) -> Dict[str, Any]:
    """
    Process payroll for ONLY employees with attendance records in the period.
    Uses PayrollSettings for universal deduction rates.
    Connects to attendance data (ProcessedAttendance or ImportRecord).
    If employee has default_days_per_cutoff set, uses that instead of attendance-based calculation.
    Returns summary of the processing.

    CRITICAL: Only includes employees who have attendance records for the period.
    This ensures terminated employees or employees not in the imported file are excluded.
    """
    from datetime import datetime

    # Get payroll settings
    settings = get_payroll_settings(db)

    # Step 1: Find employees with attendance in this period
    # Get employee IDs from ProcessedAttendance
    processed_ids = db.query(ProcessedAttendance.employee_id).filter(
        ProcessedAttendance.date >= payroll_run.period_start,
        ProcessedAttendance.date <= payroll_run.period_end
    ).distinct().all()
    processed_employee_ids = {e[0] for e in processed_ids}

    # Get employee IDs from ImportRecord via employee_name (not biometric_id)
    import_records = db.query(ImportRecord.employee_name).join(ImportBatch).filter(
        ImportRecord.date >= payroll_run.period_start,
        ImportRecord.date <= payroll_run.period_end,
        ImportRecord.employee_name.isnot(None),
        ImportRecord.employee_name != ''
    ).distinct().all()
    import_names = {r[0] for r in import_records if r[0]}

    # Map employee names to employee_ids using name matching
    import_employee_ids = set()
    if import_names:
        from app.services.attendance_import import find_employee_by_name
        for emp_name in import_names:
            employee = find_employee_by_name(db, emp_name)
            if employee:
                import_employee_ids.add(employee.id)

    # Combine: employees with ANY attendance record
    employees_with_attendance = processed_employee_ids | import_employee_ids

    if not employees_with_attendance:
        raise ValueError("No employees with attendance records found for this period. Please import attendance data first.")

    # Step 2: Include employees WITH attendance, regardless of active status
    # If they have attendance records for this period, they should be in the payroll
    # This ensures employees who resigned mid-period or are inactive still get paid for work done
    employees = db.query(Employee).filter(
        Employee.id.in_(employees_with_attendance),
        # Don't filter by status - if they have attendance, include them
        # Only exclude deleted employees
        Employee.status != 'deleted'
    ).all()

    if not employees:
        raise ValueError("No employees with attendance records found. Please verify the attendance data.")

    total_gross = 0
    total_deductions = 0
    total_net = 0
    processed_count = 0

    # Delete existing payslips for this run (for reprocessing)
    # First delete orphan loan deductions linked to these payslips
    existing_payslip_ids = [p.id for p in db.query(Payslip.id).filter(Payslip.payroll_run_id == payroll_run.id).all()]
    if existing_payslip_ids:
        db.query(LoanDeduction).filter(LoanDeduction.payslip_id.in_(existing_payslip_ids)).delete(synchronize_session='fetch')
    db.query(Payslip).filter(Payslip.payroll_run_id == payroll_run.id).delete()

    for employee in employees:
        # Get attendance summary (passes employee for name matching in ImportRecord)
        attendance = get_attendance_summary(
            db,
            employee.id,
            payroll_run.period_start,
            payroll_run.period_end,
            employee=employee
        )

        # Check if employee has a default days_per_cutoff preset
        # If set, override the attendance-based days_worked
        if employee.default_days_per_cutoff is not None:
            preset_days = float(employee.default_days_per_cutoff)
            attendance['days_worked'] = preset_days
            attendance['using_preset'] = True

        # Generate payslip with settings
        payslip = generate_payslip(db, employee, payroll_run, attendance, settings)
        db.add(payslip)
        db.flush()  # Get payslip ID for loan deductions

        # Record loan deductions and update loan balances
        if payslip.deductions.get('loans', 0) > 0:
            record_loan_deductions(
                db,
                employee.id,
                payslip.id,
                payroll_run.period_end  # Use period end as deduction date
            )

        total_gross += float(payslip.total_earnings)
        total_deductions += float(payslip.total_deductions)
        total_net += float(payslip.net_pay)
        processed_count += 1

    # Update payroll run
    payroll_run.total_gross = round(total_gross, 2)
    payroll_run.total_deductions = round(total_deductions, 2)
    payroll_run.total_net = round(total_net, 2)
    payroll_run.employee_count = processed_count
    payroll_run.status = PayrollStatus.REVIEW
    payroll_run.run_at = datetime.utcnow()

    db.commit()

    return {
        'employee_count': processed_count,
        'total_gross': round(total_gross, 2),
        'total_deductions': round(total_deductions, 2),
        'total_net': round(total_net, 2),
    }
