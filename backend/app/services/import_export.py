"""
Import/Export Service
=====================
Handle bulk imports and exports for employees, attendance, and payroll data.
"""

import io
import csv
from datetime import date, datetime
from typing import Dict, Any, List, Optional, Tuple
from decimal import Decimal
from sqlalchemy.orm import Session
import logging

from app.models.employee import Employee
from app.models.payroll import Payslip, PayrollRun

logger = logging.getLogger(__name__)


class ImportExportService:
    """Service for importing and exporting data."""

    def __init__(self, db: Session):
        self.db = db

    # ================== Employee Import/Export ==================

    def get_employee_import_template(self) -> io.StringIO:
        """Generate CSV template for employee import."""
        headers = [
            "employee_no",
            "first_name",
            "middle_name",
            "last_name",
            "email",
            "phone",
            "birth_date",
            "gender",
            "civil_status",
            "address",
            "department",
            "position",
            "date_hired",
            "employment_type",
            "monthly_salary",
            "daily_rate",
            "sss_no",
            "philhealth_no",
            "pagibig_no",
            "tin_no",
        ]

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)

        # Add example row
        writer.writerow([
            "EMP-001",
            "Juan",
            "Dela",
            "Cruz",
            "juan.cruz@example.com",
            "09171234567",
            "1990-01-15",
            "male",
            "single",
            "123 Main St, Manila",
            "Operations",
            "Staff",
            "2024-01-15",
            "regular",
            "20000.00",
            "769.23",
            "12-3456789-0",
            "12-123456789-0",
            "1234-5678-9012",
            "123-456-789-000",
        ])

        output.seek(0)
        return output

    def import_employees(
        self,
        csv_content: str,
        update_existing: bool = False
    ) -> Dict[str, Any]:
        """
        Import employees from CSV content.

        Args:
            csv_content: CSV file content as string
            update_existing: If True, update existing employees with matching employee_no

        Returns:
            Dictionary with import results
        """
        reader = csv.DictReader(io.StringIO(csv_content))

        imported = 0
        updated = 0
        skipped = 0
        errors = []

        for row_num, row in enumerate(reader, start=2):  # Start at 2 (1 is header)
            try:
                employee_no = row.get("employee_no", "").strip()
                if not employee_no:
                    errors.append({"row": row_num, "error": "Missing employee_no"})
                    skipped += 1
                    continue

                # Check if employee exists
                existing = self.db.query(Employee).filter(
                    Employee.employee_no == employee_no
                ).first()

                if existing and not update_existing:
                    skipped += 1
                    continue

                # Parse data
                employee_data = {
                    "employee_no": employee_no,
                    "first_name": row.get("first_name", "").strip(),
                    "middle_name": row.get("middle_name", "").strip() or None,
                    "last_name": row.get("last_name", "").strip(),
                    "email": row.get("email", "").strip() or None,
                    "phone": row.get("phone", "").strip() or None,
                    "gender": row.get("gender", "").strip().lower() or None,
                    "civil_status": row.get("civil_status", "").strip().lower() or None,
                    "address": row.get("address", "").strip() or None,
                    "department": row.get("department", "").strip() or None,
                    "position": row.get("position", "").strip() or None,
                    "employment_type": row.get("employment_type", "regular").strip().lower(),
                    "sss_no": row.get("sss_no", "").strip() or None,
                    "philhealth_no": row.get("philhealth_no", "").strip() or None,
                    "pagibig_no": row.get("pagibig_no", "").strip() or None,
                    "tin_no": row.get("tin_no", "").strip() or None,
                }

                # Parse dates
                birth_date_str = row.get("birth_date", "").strip()
                if birth_date_str:
                    try:
                        employee_data["birth_date"] = datetime.strptime(birth_date_str, "%Y-%m-%d").date()
                    except ValueError:
                        errors.append({"row": row_num, "error": f"Invalid birth_date format: {birth_date_str}"})

                date_hired_str = row.get("date_hired", "").strip()
                if date_hired_str:
                    try:
                        employee_data["date_hired"] = datetime.strptime(date_hired_str, "%Y-%m-%d").date()
                    except ValueError:
                        errors.append({"row": row_num, "error": f"Invalid date_hired format: {date_hired_str}"})

                # Parse numbers
                monthly_salary_str = row.get("monthly_salary", "").strip()
                if monthly_salary_str:
                    try:
                        employee_data["monthly_salary"] = Decimal(monthly_salary_str.replace(",", ""))
                    except:
                        errors.append({"row": row_num, "error": f"Invalid monthly_salary: {monthly_salary_str}"})

                daily_rate_str = row.get("daily_rate", "").strip()
                if daily_rate_str:
                    try:
                        employee_data["daily_rate"] = Decimal(daily_rate_str.replace(",", ""))
                    except:
                        errors.append({"row": row_num, "error": f"Invalid daily_rate: {daily_rate_str}"})

                # Create or update
                if existing:
                    for key, value in employee_data.items():
                        if value is not None:
                            setattr(existing, key, value)
                    updated += 1
                else:
                    employee_data["status"] = "active"
                    new_employee = Employee(**employee_data)
                    self.db.add(new_employee)
                    imported += 1

            except Exception as e:
                errors.append({"row": row_num, "error": str(e)})
                skipped += 1

        self.db.commit()

        return {
            "imported": imported,
            "updated": updated,
            "skipped": skipped,
            "errors": errors[:50],  # Limit errors to first 50
            "total_errors": len(errors)
        }

    def export_employees(
        self,
        department: Optional[str] = None,
        status: Optional[str] = None
    ) -> io.StringIO:
        """Export employees to CSV."""
        query = self.db.query(Employee)

        if department:
            from app.models.employee import Department
            query = query.join(Department).filter(Department.name == department)
        if status:
            query = query.filter(Employee.status == status)

        employees = query.order_by(Employee.employee_no).all()

        headers = [
            "employee_no",
            "first_name",
            "middle_name",
            "last_name",
            "email",
            "phone",
            "birth_date",
            "gender",
            "civil_status",
            "address",
            "department",
            "position",
            "date_hired",
            "employment_type",
            "monthly_salary",
            "daily_rate",
            "sss_no",
            "philhealth_no",
            "pagibig_no",
            "tin_no",
            "status",
        ]

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)

        for emp in employees:
            writer.writerow([
                emp.employee_no,
                emp.first_name,
                emp.middle_name or "",
                emp.last_name,
                emp.email or "",
                emp.phone or "",
                getattr(emp, 'birth_date', None).strftime("%Y-%m-%d") if getattr(emp, 'birth_date', None) else "",
                getattr(emp, 'gender', "") or "",
                getattr(emp, 'civil_status', "") or "",
                getattr(emp, 'address', "") or "",
                emp.department.name if emp.department else "",
                emp.position or "",
                emp.hire_date.strftime("%Y-%m-%d") if emp.hire_date else "",
                emp.employment_type or "",
                str(emp.basic_salary) if emp.basic_salary else "",
                str(emp.daily_rate) if emp.daily_rate else "",
                getattr(emp, 'sss_no', "") or "",
                getattr(emp, 'philhealth_no', "") or "",
                getattr(emp, 'pagibig_no', "") or "",
                getattr(emp, 'tin_no', "") or "",
                emp.status or "",
            ])

        output.seek(0)
        return output

    # ================== Payroll Export ==================

    def export_payroll_run(
        self,
        run_id: int
    ) -> io.StringIO:
        """Export payroll run data to CSV."""
        run = self.db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
        if not run:
            raise ValueError("Payroll run not found")

        payslips = self.db.query(Payslip).filter(
            Payslip.payroll_run_id == run_id
        ).all()

        headers = [
            "employee_no",
            "employee_name",
            "department",
            "basic_pay",
            "allowances",
            "overtime_pay",
            "holiday_pay",
            "gross_pay",
            "sss_ee",
            "sss_er",
            "philhealth_ee",
            "philhealth_er",
            "pagibig_ee",
            "pagibig_er",
            "withholding_tax",
            "other_deductions",
            "total_deductions",
            "net_pay",
        ]

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)

        for ps in payslips:
            emp = ps.employee
            writer.writerow([
                emp.employee_no if emp else "",
                f"{emp.first_name} {emp.last_name}" if emp else "",
                emp.department.name if emp and emp.department else "",
                str(ps.basic_pay or 0),
                str(ps.allowances or 0),
                str(ps.overtime_pay or 0),
                str(ps.holiday_pay or 0),
                str(ps.gross_pay or 0),
                str(ps.sss_ee or 0),
                str(ps.sss_er or 0),
                str(ps.philhealth_ee or 0),
                str(ps.philhealth_er or 0),
                str(ps.pagibig_ee or 0),
                str(ps.pagibig_er or 0),
                str(ps.withholding_tax or 0),
                str(ps.other_deductions or 0),
                str(ps.total_deductions or 0),
                str(ps.net_pay or 0),
            ])

        output.seek(0)
        return output

    # ================== Bank File Generation ==================

    def generate_bank_file(
        self,
        run_id: int,
        bank_format: str = "generic"
    ) -> io.StringIO:
        """
        Generate bank file for direct deposit.

        Args:
            run_id: Payroll run ID
            bank_format: Bank format ('generic', 'bpi', 'bdo', 'metrobank')

        Returns:
            CSV file for bank upload
        """
        run = self.db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
        if not run:
            raise ValueError("Payroll run not found")

        payslips = self.db.query(Payslip).filter(
            Payslip.payroll_run_id == run_id,
            Payslip.is_released == True
        ).all()

        output = io.StringIO()
        writer = csv.writer(output)

        if bank_format == "bpi":
            # BPI format
            writer.writerow(["Account Number", "Account Name", "Amount", "Remarks"])
            for ps in payslips:
                emp = ps.employee
                if emp and emp.bank_account:
                    writer.writerow([
                        emp.bank_account,
                        f"{emp.last_name}, {emp.first_name}",
                        str(ps.net_pay or 0),
                        f"Salary {run.period_start.strftime('%m/%d')}-{run.period_end.strftime('%m/%d/%Y')}"
                    ])
        elif bank_format == "bdo":
            # BDO format
            writer.writerow(["ACCOUNT_NO", "ACCOUNT_NAME", "AMOUNT", "CREDIT_MEMO"])
            for ps in payslips:
                emp = ps.employee
                if emp and emp.bank_account:
                    writer.writerow([
                        emp.bank_account,
                        f"{emp.last_name} {emp.first_name}".upper(),
                        str(ps.net_pay or 0),
                        f"SALARY {run.period_start.strftime('%m%d')}-{run.period_end.strftime('%m%d%Y')}"
                    ])
        else:
            # Generic format
            writer.writerow([
                "Employee No",
                "Employee Name",
                "Bank Account",
                "Bank Name",
                "Net Pay",
                "Pay Period"
            ])
            for ps in payslips:
                emp = ps.employee
                writer.writerow([
                    emp.employee_no if emp else "",
                    f"{emp.first_name} {emp.last_name}" if emp else "",
                    emp.bank_account if emp else "",
                    emp.bank_name if emp else "",
                    str(ps.net_pay or 0),
                    f"{run.period_start.strftime('%m/%d')}-{run.period_end.strftime('%m/%d/%Y')}"
                ])

        output.seek(0)
        return output


# Singleton instance
def get_import_export_service(db: Session) -> ImportExportService:
    return ImportExportService(db)
