"""
Monthly Payroll Summary Report
==============================
Summary of payroll data by department with totals.
"""

from typing import Dict, Any, List, Optional
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract
from decimal import Decimal
import io

from .base import BaseReportGenerator
from app.models.payroll import PayrollRun, Payslip, PayrollStatus
from app.models.employee import Employee


class MonthlyPayrollSummary(BaseReportGenerator):
    """Generate monthly payroll summary report."""

    def generate(
        self,
        year: int,
        month: int,
        department: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate monthly payroll summary.

        Args:
            year: Year (e.g., 2025)
            month: Month (1-12)
            department: Optional department filter

        Returns:
            Dictionary with summary data
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
                "period": f"{year}-{month:02d}",
                "summary": {
                    "total_employees": 0,
                    "total_gross": 0,
                    "total_deductions": 0,
                    "total_net": 0,
                },
                "by_department": [],
                "government_contributions": {
                    "sss_employee": 0,
                    "sss_employer": 0,
                    "philhealth_employee": 0,
                    "philhealth_employer": 0,
                    "pagibig_employee": 0,
                    "pagibig_employer": 0,
                    "withholding_tax": 0,
                },
                "payslips": []
            }

        # Base query for payslips
        query = self.db.query(Payslip).filter(Payslip.payroll_run_id.in_(run_ids))

        # Department filter
        if department:
            from app.models.employee import Department
            query = query.join(Employee).join(Department).filter(Department.name == department)

        payslips = query.all()

        # Calculate totals
        total_gross = Decimal("0")
        total_deductions = Decimal("0")
        total_net = Decimal("0")
        sss_ee = Decimal("0")
        sss_er = Decimal("0")
        philhealth_ee = Decimal("0")
        philhealth_er = Decimal("0")
        pagibig_ee = Decimal("0")
        pagibig_er = Decimal("0")
        tax = Decimal("0")

        department_data = {}
        payslip_data = []

        for ps in payslips:
            gross = ps.total_earnings or Decimal("0")
            deductions_total = ps.total_deductions or Decimal("0")
            net = ps.net_pay or Decimal("0")

            total_gross += gross
            total_deductions += deductions_total
            total_net += net

            # Extract government contributions from deductions JSON
            deductions_dict = ps.deductions or {}
            ps_sss_ee = Decimal(str(deductions_dict.get("sss", 0)))
            ps_sss_er = Decimal(str(deductions_dict.get("sss_employer", 0)))
            ps_philhealth_ee = Decimal(str(deductions_dict.get("philhealth", 0)))
            ps_philhealth_er = Decimal(str(deductions_dict.get("philhealth_employer", 0)))
            ps_pagibig_ee = Decimal(str(deductions_dict.get("pagibig", 0)))
            ps_pagibig_er = Decimal(str(deductions_dict.get("pagibig_employer", 0)))
            ps_tax = Decimal(str(deductions_dict.get("withholding_tax", 0)))

            sss_ee += ps_sss_ee
            sss_er += ps_sss_er
            philhealth_ee += ps_philhealth_ee
            philhealth_er += ps_philhealth_er
            pagibig_ee += ps_pagibig_ee
            pagibig_er += ps_pagibig_er
            tax += ps_tax

            # Group by department
            emp = ps.employee
            dept = emp.department.name if emp and emp.department else "Unknown"
            if dept not in department_data:
                department_data[dept] = {
                    "department": dept,
                    "employee_count": 0,
                    "gross_pay": Decimal("0"),
                    "total_deductions": Decimal("0"),
                    "net_pay": Decimal("0"),
                }
            department_data[dept]["employee_count"] += 1
            department_data[dept]["gross_pay"] += gross
            department_data[dept]["total_deductions"] += deductions_total
            department_data[dept]["net_pay"] += net

            # Individual payslip data
            payslip_data.append({
                "employee_no": emp.employee_no if emp else "",
                "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
                "department": dept,
                "gross_pay": float(gross),
                "total_deductions": float(deductions_total),
                "net_pay": float(net),
                "sss": float(ps_sss_ee),
                "philhealth": float(ps_philhealth_ee),
                "pagibig": float(ps_pagibig_ee),
                "tax": float(ps_tax),
            })

        # Convert department data to list
        by_department = [
            {
                "department": v["department"],
                "employee_count": v["employee_count"],
                "gross_pay": float(v["gross_pay"]),
                "total_deductions": float(v["total_deductions"]),
                "net_pay": float(v["net_pay"]),
            }
            for v in sorted(department_data.values(), key=lambda x: x["department"])
        ]

        return {
            "year": year,
            "month": month,
            "period": f"{year}-{month:02d}",
            "summary": {
                "total_employees": len(payslips),
                "total_gross": float(total_gross),
                "total_deductions": float(total_deductions),
                "total_net": float(total_net),
            },
            "by_department": by_department,
            "government_contributions": {
                "sss_employee": float(sss_ee),
                "sss_employer": float(sss_er),
                "philhealth_employee": float(philhealth_ee),
                "philhealth_employer": float(philhealth_er),
                "pagibig_employee": float(pagibig_ee),
                "pagibig_employer": float(pagibig_er),
                "withholding_tax": float(tax),
            },
            "payslips": payslip_data
        }

    def to_csv(
        self,
        year: int,
        month: int,
        department: Optional[str] = None
    ) -> io.StringIO:
        """Export monthly payroll summary to CSV."""
        data = self.generate(year, month, department)

        headers = [
            "Employee No",
            "Employee Name",
            "Department",
            "Gross Pay",
            "SSS",
            "PhilHealth",
            "Pag-IBIG",
            "Tax",
            "Total Deductions",
            "Net Pay"
        ]

        rows = []
        for ps in data["payslips"]:
            rows.append([
                ps["employee_no"],
                ps["employee_name"],
                ps["department"],
                self.format_decimal(Decimal(str(ps["gross_pay"]))),
                self.format_decimal(Decimal(str(ps["sss"]))),
                self.format_decimal(Decimal(str(ps["philhealth"]))),
                self.format_decimal(Decimal(str(ps["pagibig"]))),
                self.format_decimal(Decimal(str(ps["tax"]))),
                self.format_decimal(Decimal(str(ps["total_deductions"]))),
                self.format_decimal(Decimal(str(ps["net_pay"]))),
            ])

        # Add totals row
        summary = data["summary"]
        govt = data["government_contributions"]
        rows.append([])  # Empty row
        rows.append([
            "TOTAL",
            f"{summary['total_employees']} employees",
            "",
            self.format_decimal(Decimal(str(summary["total_gross"]))),
            self.format_decimal(Decimal(str(govt["sss_employee"]))),
            self.format_decimal(Decimal(str(govt["philhealth_employee"]))),
            self.format_decimal(Decimal(str(govt["pagibig_employee"]))),
            self.format_decimal(Decimal(str(govt["withholding_tax"]))),
            self.format_decimal(Decimal(str(summary["total_deductions"]))),
            self.format_decimal(Decimal(str(summary["total_net"]))),
        ])

        return self.create_csv(headers, rows)
