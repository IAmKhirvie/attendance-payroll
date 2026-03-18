"""
Attendance Report
=================
Attendance summary report for employees.
"""

from typing import Dict, Any, List, Optional
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract
from decimal import Decimal
import io

from .base import BaseReportGenerator
from app.models.attendance import ProcessedAttendance
from app.models.employee import Employee


class AttendanceReport(BaseReportGenerator):
    """Generate attendance report."""

    def generate(
        self,
        start_date: date,
        end_date: date,
        employee_id: Optional[int] = None,
        department: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate attendance report.

        Args:
            start_date: Start date of report period
            end_date: End date of report period
            employee_id: Optional employee filter
            department: Optional department filter

        Returns:
            Dictionary with attendance data
        """
        # Base query
        query = self.db.query(ProcessedAttendance).filter(
            ProcessedAttendance.date >= start_date,
            ProcessedAttendance.date <= end_date
        )

        # Filters
        if employee_id:
            query = query.filter(ProcessedAttendance.employee_id == employee_id)
        if department:
            from app.models.employee import Department
            query = query.join(Employee).join(Department).filter(Department.name == department)

        records = query.order_by(
            ProcessedAttendance.employee_id,
            ProcessedAttendance.date
        ).all()

        # Group by employee
        employee_data = {}

        for rec in records:
            emp_id = rec.employee_id
            if emp_id not in employee_data:
                emp = rec.employee
                employee_data[emp_id] = {
                    "employee_id": emp_id,
                    "employee_no": emp.employee_no if emp else "",
                    "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
                    "department": emp.department.name if emp and emp.department else "",
                    "total_days": 0,
                    "present_days": 0,
                    "absent_days": 0,
                    "late_count": 0,
                    "total_late_minutes": 0,
                    "undertime_count": 0,
                    "total_undertime_minutes": 0,
                    "overtime_hours": Decimal("0"),
                    "holiday_days": 0,
                    "leave_days": 0,
                    "records": []
                }

            data = employee_data[emp_id]
            data["total_days"] += 1

            # Attendance status (using AttendanceStatus enum values)
            status = rec.status.value if rec.status else "unknown"
            if status in ["complete", "incomplete"]:
                data["present_days"] += 1
            elif status == "absent":
                data["absent_days"] += 1
            elif status == "holiday":
                data["holiday_days"] += 1
            elif status == "on_leave":
                data["leave_days"] += 1
            elif status == "rest_day":
                pass  # Don't count rest days

            # Late
            late_mins = rec.late_minutes or 0
            if late_mins > 0:
                data["late_count"] += 1
                data["total_late_minutes"] += late_mins

            # Undertime
            undertime_mins = rec.undertime_minutes or 0
            if undertime_mins > 0:
                data["undertime_count"] += 1
                data["total_undertime_minutes"] += undertime_mins

            # Overtime (stored in minutes, convert to hours for display)
            ot_minutes = rec.overtime_minutes or 0
            ot_hours = Decimal(str(ot_minutes)) / Decimal("60")
            data["overtime_hours"] += ot_hours

            # Worked time (stored in minutes, convert to hours for display)
            worked_minutes = rec.worked_minutes or 0
            worked_hours = worked_minutes / 60.0

            # Add record details
            data["records"].append({
                "date": self.format_date(rec.date),
                "day": rec.date.strftime("%a"),
                "time_in": rec.time_in.strftime("%H:%M") if rec.time_in else "-",
                "time_out": rec.time_out.strftime("%H:%M") if rec.time_out else "-",
                "worked_hours": worked_hours,
                "late_minutes": late_mins,
                "undertime_minutes": undertime_mins,
                "overtime_hours": float(ot_hours),
                "status": status,
            })

        # Convert to list and calculate summary
        employees = list(employee_data.values())
        for emp in employees:
            emp["overtime_hours"] = float(emp["overtime_hours"])
            emp["attendance_rate"] = round(
                (emp["present_days"] / emp["total_days"] * 100) if emp["total_days"] > 0 else 0, 1
            )

        # Overall summary
        total_employees = len(employees)
        total_present = sum(e["present_days"] for e in employees)
        total_absent = sum(e["absent_days"] for e in employees)
        total_late = sum(e["late_count"] for e in employees)
        total_days = sum(e["total_days"] for e in employees)

        return {
            "period": {
                "start_date": self.format_date(start_date),
                "end_date": self.format_date(end_date),
            },
            "summary": {
                "total_employees": total_employees,
                "total_attendance_records": total_days,
                "total_present_days": total_present,
                "total_absent_days": total_absent,
                "total_late_instances": total_late,
                "average_attendance_rate": round(
                    (total_present / total_days * 100) if total_days > 0 else 0, 1
                ),
            },
            "employees": employees
        }

    def to_csv(
        self,
        start_date: date,
        end_date: date,
        employee_id: Optional[int] = None,
        department: Optional[str] = None,
        detailed: bool = False
    ) -> io.StringIO:
        """
        Export attendance report to CSV.

        Args:
            detailed: If True, include daily records. If False, summary only.
        """
        data = self.generate(start_date, end_date, employee_id, department)

        if detailed:
            # Detailed report with daily records
            headers = [
                "Employee No",
                "Employee Name",
                "Department",
                "Date",
                "Day",
                "Time In",
                "Time Out",
                "Worked Hours",
                "Late (mins)",
                "Undertime (mins)",
                "OT Hours",
                "Status"
            ]

            rows = []
            for emp in data["employees"]:
                for rec in emp["records"]:
                    rows.append([
                        emp["employee_no"],
                        emp["employee_name"],
                        emp["department"],
                        rec["date"],
                        rec["day"],
                        rec["time_in"],
                        rec["time_out"],
                        f"{rec['worked_hours']:.2f}",
                        rec["late_minutes"],
                        rec["undertime_minutes"],
                        f"{rec['overtime_hours']:.2f}",
                        rec["status"],
                    ])
        else:
            # Summary report
            headers = [
                "Employee No",
                "Employee Name",
                "Department",
                "Total Days",
                "Present",
                "Absent",
                "Late Count",
                "Total Late (mins)",
                "OT Hours",
                "Attendance Rate %"
            ]

            rows = []
            for emp in data["employees"]:
                rows.append([
                    emp["employee_no"],
                    emp["employee_name"],
                    emp["department"],
                    emp["total_days"],
                    emp["present_days"],
                    emp["absent_days"],
                    emp["late_count"],
                    emp["total_late_minutes"],
                    f"{emp['overtime_hours']:.2f}",
                    f"{emp['attendance_rate']}%",
                ])

        return self.create_csv(headers, rows)
