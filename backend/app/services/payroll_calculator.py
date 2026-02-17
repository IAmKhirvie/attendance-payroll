"""
Philippine Payroll Calculator
=============================
Simplified payroll calculator with manual adjustments support.
All amounts in Philippine Peso (PHP).

ICAN Attendance Deduction Formulas (enabled by default):
- Absence Deduction: Daily Rate = Monthly Salary × 12 ÷ 261 days
- Tardiness/Undertime: Minute Rate = Daily Rate ÷ Hours per day ÷ 60 minutes

Cutoff Schedule:
- 1st cutoff (1-15): Deduct loans, tax
- 2nd cutoff (16-end): Deduct SSS, PhilHealth, Pag-IBIG, tax

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
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.attendance import ProcessedAttendance, AttendanceStatus, ImportRecord, ImportBatch
from app.models.payroll import PayrollRun, Payslip, PayrollStatus, PayrollSettings


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


def calculate_sss(monthly_salary: float) -> float:
    """Calculate SSS employee contribution based on 2024 table."""
    for bracket in SSS_TABLE_2024:
        if bracket["min"] <= monthly_salary <= bracket["max"]:
            return bracket["ee"]
    return 1350  # Maximum


def calculate_philhealth(monthly_salary: float) -> float:
    """
    Calculate PhilHealth employee contribution.
    2024: 5% of monthly basic salary, shared equally (2.5% each).
    Min: PHP 500, Max: PHP 5,000 (total), employee share is half.
    """
    total = monthly_salary * 0.05
    total = max(500, min(total, 5000))
    return round(total / 2, 2)


def calculate_pagibig(monthly_salary: float) -> float:
    """
    Calculate Pag-IBIG employee contribution.
    2% of monthly salary, max PHP 200.
    """
    contribution = monthly_salary * 0.02
    return min(round(contribution, 2), 200)


def calculate_tax(monthly_taxable: float) -> float:
    """Calculate withholding tax based on TRAIN Law 2024."""
    if monthly_taxable <= 20833:
        return 0
    elif monthly_taxable <= 33332:
        return round((monthly_taxable - 20833) * 0.15, 2)
    elif monthly_taxable <= 66666:
        return round(1875 + (monthly_taxable - 33333) * 0.20, 2)
    elif monthly_taxable <= 166666:
        return round(8541.67 + (monthly_taxable - 66667) * 0.25, 2)
    elif monthly_taxable <= 666666:
        return round(33541.67 + (monthly_taxable - 166667) * 0.30, 2)
    else:
        return round(183541.67 + (monthly_taxable - 666667) * 0.35, 2)


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
            overtime_rate=1.25,
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
    """
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

    if records:
        # Use ProcessedAttendance
        for record in records:
            if record.worked_minutes and record.worked_minutes > 0:
                total_worked_minutes += record.worked_minutes
                days_worked += 1
            elif record.status == AttendanceStatus.ABSENT:
                days_absent += 1
            elif record.date.weekday() < 5:  # Weekday with no work
                days_absent += 1

            if hasattr(record, 'late_minutes') and record.late_minutes and record.late_minutes > 0:
                total_late_minutes += record.late_minutes
                late_count += 1

            if hasattr(record, 'overtime_minutes') and record.overtime_minutes and record.overtime_minutes > 0:
                total_ot_minutes += record.overtime_minutes

            if hasattr(record, 'undertime_minutes') and record.undertime_minutes and record.undertime_minutes > 0:
                total_undertime_minutes += record.undertime_minutes
    else:
        # Fall back to ImportRecord (from imported attendance files)
        if employee and employee.biometric_id:
            import_records = db.query(ImportRecord).join(ImportBatch).filter(
                ImportRecord.employee_biometric_id == employee.biometric_id,
                ImportRecord.date >= period_start,
                ImportRecord.date <= period_end
            ).all()

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
    work_hours_per_day = float(settings.work_hours_per_day or 8)

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

    # Calculate semi-monthly amounts
    basic_semi = round(monthly_basic / 2, 2)
    allowance_semi = round(monthly_allowance / 2, 2)
    productivity_semi = round(monthly_productivity / 2, 2)
    language_semi = round(monthly_language / 2, 2)

    # Calculate deductions for absences
    # Priority: ICAN formula > universal rate from settings > employee daily_rate
    absent_amount = 0
    effective_daily_rate = 0.0
    if attendance['days_absent'] > 0:
        if use_ican_formula and ican_daily_rate > 0:
            # Use ICAN formula: Daily Rate = Monthly Salary × 12 ÷ 261
            effective_daily_rate = ican_daily_rate
            absent_amount = round(ican_daily_rate * attendance['days_absent'], 2)
        elif absent_rate_per_day > 0:
            effective_daily_rate = absent_rate_per_day
            absent_amount = round(absent_rate_per_day * attendance['days_absent'], 2)
        elif daily_rate > 0:
            effective_daily_rate = daily_rate
            absent_amount = round(daily_rate * attendance['days_absent'], 2)

    # Calculate late deductions (Tardiness)
    # Priority: ICAN minute rate > per-minute setting > per-incident > hourly rate fallback
    late_amount = 0
    total_late_minutes = attendance['total_late_minutes']
    late_count = attendance['late_count']
    effective_minute_rate = 0.0

    if use_ican_formula and ican_minute_rate > 0 and total_late_minutes > 0:
        # Use ICAN formula: Minute Rate = Daily Rate ÷ Hours per day ÷ 60
        effective_minute_rate = ican_minute_rate
        late_amount = round(ican_minute_rate * total_late_minutes, 2)
    elif late_rate_per_minute > 0 and total_late_minutes > 0:
        effective_minute_rate = late_rate_per_minute
        late_amount = round(late_rate_per_minute * total_late_minutes, 2)
    elif late_rate_per_incident > 0 and late_count > 0:
        late_amount = round(late_rate_per_incident * late_count, 2)
    elif hourly_rate > 0 and attendance['total_late_hours'] > 0:
        late_amount = round(hourly_rate * attendance['total_late_hours'], 2)

    # Calculate undertime deduction
    # Priority: ICAN minute rate > undertime setting rate
    undertime_amount = 0
    total_undertime = attendance.get('total_undertime_minutes', 0)
    if use_ican_formula and ican_minute_rate > 0 and total_undertime > 0:
        # Use ICAN formula: same minute rate as tardiness
        undertime_amount = round(ican_minute_rate * total_undertime, 2)
    elif undertime_rate_per_minute > 0 and total_undertime > 0:
        undertime_amount = round(undertime_rate_per_minute * total_undertime, 2)

    # Build earnings (all adjustable by HR)
    earnings = {
        'basic_semi': basic_semi,
        'allowance_semi': allowance_semi,
        'productivity_incentive_semi': productivity_semi,
        'language_incentive_semi': language_semi,
        'regular_holiday': 0,  # HR will fill
        'regular_holiday_ot': 0,  # HR will fill
        'snwh': 0,  # Special Non-Working Holiday - HR will fill
        'snwh_ot': 0,  # SNWH Overtime - HR will fill
        # Calculation reference (for transparency)
        '_calculation_info': {
            'monthly_basic': monthly_basic,
            'use_ican_formula': use_ican_formula,
            'working_days_per_year': working_days_per_year,
            'work_hours_per_day': work_hours_per_day,
            'ican_daily_rate': ican_daily_rate,  # Monthly × 12 ÷ 261
            'ican_minute_rate': ican_minute_rate,  # Daily Rate ÷ Hours ÷ 60
        }
    }

    total_earnings = basic_semi + allowance_semi + productivity_semi + language_semi

    # Build deductions based on cutoff
    deductions = {
        'absences_days': attendance['days_absent'],
        'absences_amount': absent_amount,
        'absences_daily_rate_used': effective_daily_rate,  # Rate used for absence deduction
        'late_hours': attendance['total_late_hours'],
        'late_minutes': attendance['total_late_minutes'],
        'late_amount': late_amount,
        'late_minute_rate_used': effective_minute_rate,  # Rate used for late deduction
        'undertime_minutes': total_undertime,
        'undertime_amount': undertime_amount,
    }

    # Get employee-specific government contributions or use defaults/calculated values
    emp_sss = float(employee.sss_contribution or 0) if hasattr(employee, 'sss_contribution') and employee.sss_contribution else None
    emp_philhealth = float(employee.philhealth_contribution or 0) if hasattr(employee, 'philhealth_contribution') and employee.philhealth_contribution else None
    emp_pagibig = float(employee.pagibig_contribution or 0) if hasattr(employee, 'pagibig_contribution') and employee.pagibig_contribution else None
    emp_tax = float(employee.tax_amount or 0) if hasattr(employee, 'tax_amount') and employee.tax_amount else None

    # Default contributions from settings
    default_sss = float(settings.default_sss or 0)
    default_philhealth = float(settings.default_philhealth or 0)
    default_pagibig = float(settings.default_pagibig or 0)
    default_tax = float(settings.default_tax or 0)

    # Government deductions based on cutoff
    if cutoff == 1:
        # 1st cutoff: Only loans and tax
        if emp_tax is not None:
            tax_semi = round(emp_tax / 2, 2)
        elif default_tax > 0:
            tax_semi = round(default_tax / 2, 2)
        else:
            tax_semi = round(calculate_tax(monthly_basic) / 2, 2)

        deductions['tax'] = tax_semi
        deductions['loans'] = 0  # HR will fill
        deductions['sss'] = 0
        deductions['philhealth'] = 0
        deductions['pagibig'] = 0
    else:
        # 2nd cutoff: SSS, PhilHealth, Pag-IBIG, tax
        # Use employee-specific values if set, then defaults, then calculated
        if emp_sss is not None:
            deductions['sss'] = emp_sss
        elif default_sss > 0:
            deductions['sss'] = default_sss
        else:
            deductions['sss'] = calculate_sss(monthly_basic)

        if emp_philhealth is not None:
            deductions['philhealth'] = emp_philhealth
        elif default_philhealth > 0:
            deductions['philhealth'] = default_philhealth
        else:
            deductions['philhealth'] = calculate_philhealth(monthly_basic)

        if emp_pagibig is not None:
            deductions['pagibig'] = emp_pagibig
        elif default_pagibig > 0:
            deductions['pagibig'] = default_pagibig
        else:
            deductions['pagibig'] = calculate_pagibig(monthly_basic)

        if emp_tax is not None:
            deductions['tax'] = round(emp_tax / 2, 2)
        elif default_tax > 0:
            deductions['tax'] = round(default_tax / 2, 2)
        else:
            deductions['tax'] = round(calculate_tax(monthly_basic) / 2, 2)

        deductions['loans'] = 0  # HR will fill

    # Calculate totals
    total_deductions = (
        deductions['absences_amount'] +
        deductions['late_amount'] +
        deductions.get('undertime_amount', 0) +
        deductions.get('sss', 0) +
        deductions.get('philhealth', 0) +
        deductions.get('pagibig', 0) +
        deductions.get('tax', 0) +
        deductions.get('loans', 0)
    )

    net_pay = total_earnings - total_deductions

    # Create payslip
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
        late_count=attendance['late_count'],
        total_late_minutes=attendance['total_late_minutes'],
        overtime_hours=attendance['total_ot_hours'],
        undertime_minutes=total_undertime,
        absent_deduction=absent_amount,
        late_deduction=late_amount,
        undertime_deduction=undertime_amount,
    )

    return payslip


def process_payroll(db: Session, payroll_run: PayrollRun) -> Dict[str, Any]:
    """
    Process payroll for all active employees.
    Uses PayrollSettings for universal deduction rates.
    Connects to attendance data (ProcessedAttendance or ImportRecord).
    Returns summary of the processing.
    """
    from datetime import datetime

    # Get payroll settings
    settings = get_payroll_settings(db)

    # Get all active, verified employees
    employees = db.query(Employee).filter(
        Employee.is_active == True,
        Employee.status == 'active'
    ).all()

    if not employees:
        raise ValueError("No active employees found. Please verify pending employees first.")

    total_gross = 0
    total_deductions = 0
    total_net = 0
    processed_count = 0

    # Delete existing payslips for this run (for reprocessing)
    db.query(Payslip).filter(Payslip.payroll_run_id == payroll_run.id).delete()

    for employee in employees:
        # Get attendance summary (passes employee for biometric_id lookup in ImportRecord)
        attendance = get_attendance_summary(
            db,
            employee.id,
            payroll_run.period_start,
            payroll_run.period_end,
            employee=employee
        )

        # Generate payslip with settings
        payslip = generate_payslip(db, employee, payroll_run, attendance, settings)
        db.add(payslip)

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
