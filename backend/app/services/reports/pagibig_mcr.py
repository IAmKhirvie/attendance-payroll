"""
Pag-IBIG MCR Report
===================
Monthly Collection Report for Pag-IBIG Fund.
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


class PagIBIGMCRReport(BaseReportGenerator):
    """Generate Pag-IBIG MCR (Monthly Collection Report)."""

    def generate(
        self,
        year: int,
        month: int
    ) -> Dict[str, Any]:
        """
        Generate Pag-IBIG MCR report data.

        Args:
            year: Year (e.g., 2025)
            month: Month (1-12)

        Returns:
            Dictionary with Pag-IBIG contribution data
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
                "total_ee_share": 0,
                "total_er_share": 0,
                "total_contribution": 0,
                "contributions": []
            }

        # Get all payslips for the period
        payslips = self.db.query(Payslip).filter(
            Payslip.payroll_run_id.in_(run_ids)
        ).all()

        # Aggregate by employee
        employee_contributions = {}

        for ps in payslips:
            # Extract Pag-IBIG contributions from deductions JSON
            deductions_dict = ps.deductions or {}
            pagibig_ee = Decimal(str(deductions_dict.get("pagibig", 0)))
            pagibig_er = Decimal(str(deductions_dict.get("pagibig_employer", 0)))

            # Skip if no Pag-IBIG contribution
            if pagibig_ee == 0 and pagibig_er == 0:
                continue

            emp_id = ps.employee_id
            emp = ps.employee

            if emp_id not in employee_contributions:
                employee_contributions[emp_id] = {
                    "employee_id": emp_id,
                    "pagibig_no": getattr(emp, 'pagibig_no', "") if emp else "",
                    "employee_no": emp.employee_no if emp else "",
                    "last_name": emp.last_name if emp else "",
                    "first_name": emp.first_name if emp else "",
                    "middle_name": emp.middle_name if emp else "",
                    "birthdate": self.format_date(getattr(emp, 'birth_date', None)) if emp and getattr(emp, 'birth_date', None) else "",
                    "monthly_compensation": Decimal("0"),
                    "ee_share": Decimal("0"),
                    "er_share": Decimal("0"),
                    "total_contribution": Decimal("0"),
                }

            contrib = employee_contributions[emp_id]
            contrib["ee_share"] += pagibig_ee
            contrib["er_share"] += pagibig_er
            if ps.total_earnings:
                contrib["monthly_compensation"] = max(
                    contrib["monthly_compensation"],
                    ps.total_earnings
                )

        # Calculate totals and format
        contributions = []
        total_ee = Decimal("0")
        total_er = Decimal("0")

        for emp_id, data in sorted(employee_contributions.items(), key=lambda x: x[1]["last_name"]):
            data["total_contribution"] = data["ee_share"] + data["er_share"]
            total_ee += data["ee_share"]
            total_er += data["er_share"]

            contributions.append({
                "pagibig_no": data["pagibig_no"],
                "employee_no": data["employee_no"],
                "last_name": data["last_name"],
                "first_name": data["first_name"],
                "middle_name": data["middle_name"],
                "birthdate": data["birthdate"],
                "monthly_compensation": float(data["monthly_compensation"]),
                "ee_share": float(data["ee_share"]),
                "er_share": float(data["er_share"]),
                "total_contribution": float(data["total_contribution"]),
            })

        return {
            "year": year,
            "month": month,
            "applicable_month": f"{year}-{month:02d}",
            "total_employees": len(contributions),
            "total_ee_share": float(total_ee),
            "total_er_share": float(total_er),
            "total_contribution": float(total_ee + total_er),
            "contributions": contributions
        }

    def to_csv(
        self,
        year: int,
        month: int
    ) -> io.StringIO:
        """Export Pag-IBIG MCR report to CSV."""
        data = self.generate(year, month)

        headers = [
            "Pag-IBIG MID No.",
            "Employee No.",
            "Last Name",
            "First Name",
            "Middle Name",
            "Birth Date",
            "Monthly Compensation",
            "Employee Share",
            "Employer Share",
            "Total"
        ]

        rows = []
        for c in data["contributions"]:
            rows.append([
                c["pagibig_no"],
                c["employee_no"],
                c["last_name"],
                c["first_name"],
                c["middle_name"],
                c["birthdate"],
                self.format_decimal(Decimal(str(c["monthly_compensation"]))),
                self.format_decimal(Decimal(str(c["ee_share"]))),
                self.format_decimal(Decimal(str(c["er_share"]))),
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
            self.format_decimal(Decimal(str(data["total_ee_share"]))),
            self.format_decimal(Decimal(str(data["total_er_share"]))),
            self.format_decimal(Decimal(str(data["total_contribution"]))),
        ])

        return self.create_csv(headers, rows)

    def to_mcr_format(
        self,
        year: int,
        month: int,
        employer_pagibig_no: str = "",
        employer_name: str = "",
        address: str = ""
    ) -> io.StringIO:
        """
        Export in Pag-IBIG MCR text file format.
        """
        data = self.generate(year, month)

        output = io.StringIO()

        # Header
        output.write(f"PAG-IBIG MONTHLY COLLECTION REPORT (MCR)\n")
        output.write(f"Applicable Month: {data['applicable_month']}\n")
        output.write(f"Employer Pag-IBIG No: {employer_pagibig_no}\n")
        output.write(f"Employer Name: {employer_name}\n")
        output.write(f"Address: {address}\n")
        output.write(f"Total Employees: {data['total_employees']}\n")
        output.write("\n")

        # Column headers
        output.write(f"{'Pag-IBIG MID':<20}{'Name':<40}{'EE':>12}{'ER':>12}{'Total':>12}\n")
        output.write("-" * 96 + "\n")

        for c in data["contributions"]:
            name = f"{c['last_name']}, {c['first_name']} {c['middle_name']}".strip()
            output.write(
                f"{c['pagibig_no']:<20}"
                f"{name[:38]:<40}"
                f"{c['ee_share']:>12,.2f}"
                f"{c['er_share']:>12,.2f}"
                f"{c['total_contribution']:>12,.2f}\n"
            )

        output.write("-" * 96 + "\n")
        output.write(
            f"{'TOTAL':<60}"
            f"{data['total_ee_share']:>12,.2f}"
            f"{data['total_er_share']:>12,.2f}"
            f"{data['total_contribution']:>12,.2f}\n"
        )

        output.seek(0)
        return output
