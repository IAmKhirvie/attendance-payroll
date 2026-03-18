"""
SSS R3 Report
=============
Monthly SSS Contribution Report for submission to SSS.
"""

from typing import Dict, Any, List, Optional
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract
from decimal import Decimal
import io

from .base import BaseReportGenerator
from app.models.payroll import PayrollRun, Payslip
from app.models.employee import Employee


class SSSR3Report(BaseReportGenerator):
    """Generate SSS R3 (Monthly Contribution Report)."""

    def generate(
        self,
        year: int,
        month: int
    ) -> Dict[str, Any]:
        """
        Generate SSS R3 report data.

        Args:
            year: Year (e.g., 2025)
            month: Month (1-12)

        Returns:
            Dictionary with SSS contribution data
        """
        # Query payroll runs for the month
        runs = self.db.query(PayrollRun).filter(
            extract('year', PayrollRun.period_start) == year,
            extract('month', PayrollRun.period_start) == month
        ).all()

        run_ids = [r.id for r in runs]

        if not run_ids:
            return {
                "year": year,
                "month": month,
                "applicable_month": f"{year}-{month:02d}",
                "total_employees": 0,
                "total_ee_contribution": 0,
                "total_er_contribution": 0,
                "total_contribution": 0,
                "contributions": []
            }

        # Get payslips with SSS contributions
        payslips = self.db.query(Payslip).filter(
            Payslip.payroll_run_id.in_(run_ids),
            Payslip.sss_ee > 0
        ).all()

        # Aggregate by employee (sum contributions if multiple payslips)
        employee_contributions = {}

        for ps in payslips:
            emp_id = ps.employee_id
            emp = ps.employee

            if emp_id not in employee_contributions:
                employee_contributions[emp_id] = {
                    "employee_id": emp_id,
                    "sss_no": emp.sss_no if emp else "",
                    "employee_no": emp.employee_no if emp else "",
                    "last_name": emp.last_name if emp else "",
                    "first_name": emp.first_name if emp else "",
                    "middle_name": emp.middle_name if emp else "",
                    "birthdate": self.format_date(emp.birth_date) if emp and emp.birth_date else "",
                    "monthly_salary_credit": Decimal("0"),
                    "ee_contribution": Decimal("0"),
                    "er_contribution": Decimal("0"),
                    "total_contribution": Decimal("0"),
                }

            contrib = employee_contributions[emp_id]
            contrib["ee_contribution"] += ps.sss_ee or Decimal("0")
            contrib["er_contribution"] += ps.sss_er or Decimal("0")
            # MSC is typically the basis for contributions
            if ps.gross_pay:
                contrib["monthly_salary_credit"] = max(
                    contrib["monthly_salary_credit"],
                    ps.gross_pay
                )

        # Calculate totals and format
        contributions = []
        total_ee = Decimal("0")
        total_er = Decimal("0")

        for emp_id, data in sorted(employee_contributions.items(), key=lambda x: x[1]["last_name"]):
            data["total_contribution"] = data["ee_contribution"] + data["er_contribution"]
            total_ee += data["ee_contribution"]
            total_er += data["er_contribution"]

            contributions.append({
                "sss_no": data["sss_no"],
                "employee_no": data["employee_no"],
                "last_name": data["last_name"],
                "first_name": data["first_name"],
                "middle_name": data["middle_name"],
                "birthdate": data["birthdate"],
                "monthly_salary_credit": float(data["monthly_salary_credit"]),
                "ee_contribution": float(data["ee_contribution"]),
                "er_contribution": float(data["er_contribution"]),
                "total_contribution": float(data["total_contribution"]),
            })

        return {
            "year": year,
            "month": month,
            "applicable_month": f"{year}-{month:02d}",
            "total_employees": len(contributions),
            "total_ee_contribution": float(total_ee),
            "total_er_contribution": float(total_er),
            "total_contribution": float(total_ee + total_er),
            "contributions": contributions
        }

    def to_csv(
        self,
        year: int,
        month: int
    ) -> io.StringIO:
        """Export SSS R3 report to CSV (format for SSS submission)."""
        data = self.generate(year, month)

        headers = [
            "SSS No.",
            "Employee No.",
            "Last Name",
            "First Name",
            "Middle Name",
            "Birth Date",
            "Monthly Salary Credit",
            "EE (Employee)",
            "ER (Employer)",
            "Total"
        ]

        rows = []
        for c in data["contributions"]:
            rows.append([
                c["sss_no"],
                c["employee_no"],
                c["last_name"],
                c["first_name"],
                c["middle_name"],
                c["birthdate"],
                self.format_decimal(Decimal(str(c["monthly_salary_credit"]))),
                self.format_decimal(Decimal(str(c["ee_contribution"]))),
                self.format_decimal(Decimal(str(c["er_contribution"]))),
                self.format_decimal(Decimal(str(c["total_contribution"]))),
            ])

        # Add totals row
        rows.append([])  # Empty row
        rows.append([
            "TOTAL",
            "",
            "",
            "",
            "",
            "",
            "",
            self.format_decimal(Decimal(str(data["total_ee_contribution"]))),
            self.format_decimal(Decimal(str(data["total_er_contribution"]))),
            self.format_decimal(Decimal(str(data["total_contribution"]))),
        ])

        return self.create_csv(headers, rows)

    def to_r3_format(
        self,
        year: int,
        month: int,
        employer_sss_no: str = "",
        employer_name: str = ""
    ) -> io.StringIO:
        """
        Export in SSS R3 text file format.

        This is a simplified format. Actual R3 may have specific field positions.
        """
        data = self.generate(year, month)

        output = io.StringIO()

        # Header
        output.write(f"SSS MONTHLY CONTRIBUTION REPORT (R3)\n")
        output.write(f"Applicable Month: {data['applicable_month']}\n")
        output.write(f"Employer SSS No: {employer_sss_no}\n")
        output.write(f"Employer Name: {employer_name}\n")
        output.write(f"Total Employees: {data['total_employees']}\n")
        output.write("\n")

        # Column headers
        output.write(f"{'SSS No.':<15}{'Name':<40}{'EE':>12}{'ER':>12}{'Total':>12}\n")
        output.write("-" * 91 + "\n")

        for c in data["contributions"]:
            name = f"{c['last_name']}, {c['first_name']} {c['middle_name']}".strip()
            output.write(
                f"{c['sss_no']:<15}"
                f"{name[:38]:<40}"
                f"{c['ee_contribution']:>12,.2f}"
                f"{c['er_contribution']:>12,.2f}"
                f"{c['total_contribution']:>12,.2f}\n"
            )

        output.write("-" * 91 + "\n")
        output.write(
            f"{'TOTAL':<55}"
            f"{data['total_ee_contribution']:>12,.2f}"
            f"{data['total_er_contribution']:>12,.2f}"
            f"{data['total_contribution']:>12,.2f}\n"
        )

        output.seek(0)
        return output
