"""
Reports API Endpoints
=====================
API endpoints for generating and downloading reports.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
import io

from app.api.deps import get_db, get_current_admin
from app.models.user import User
from app.services.reports import (
    MonthlyPayrollSummary,
    AttendanceReport,
    SSSR3Report,
    PhilHealthRF1Report,
    PagIBIGMCRReport,
)

router = APIRouter()


# ================== Monthly Payroll Summary ==================

@router.get("/payroll-summary")
async def get_payroll_summary(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    department: Optional[str] = Query(None, description="Filter by department"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get monthly payroll summary data (Admin only)."""
    report = MonthlyPayrollSummary(db)
    return report.generate(year, month, department)


@router.get("/payroll-summary/csv")
async def export_payroll_summary_csv(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    department: Optional[str] = Query(None, description="Filter by department"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export monthly payroll summary to CSV (Admin only)."""
    report = MonthlyPayrollSummary(db)
    csv_data = report.to_csv(year, month, department)

    filename = f"payroll_summary_{year}_{month:02d}.csv"
    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================== Attendance Report ==================

@router.get("/attendance")
async def get_attendance_report(
    start_date: date = Query(..., description="Start date"),
    end_date: date = Query(..., description="End date"),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
    department: Optional[str] = Query(None, description="Filter by department"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get attendance report data (Admin only)."""
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    report = AttendanceReport(db)
    return report.generate(start_date, end_date, employee_id, department)


@router.get("/attendance/csv")
async def export_attendance_csv(
    start_date: date = Query(..., description="Start date"),
    end_date: date = Query(..., description="End date"),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
    department: Optional[str] = Query(None, description="Filter by department"),
    detailed: bool = Query(False, description="Include daily records"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export attendance report to CSV (Admin only)."""
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    report = AttendanceReport(db)
    csv_data = report.to_csv(start_date, end_date, employee_id, department, detailed)

    filename = f"attendance_report_{start_date}_{end_date}.csv"
    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================== SSS R3 Report ==================

@router.get("/sss-r3")
async def get_sss_r3_report(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get SSS R3 (Monthly Contribution Report) data (Admin only)."""
    report = SSSR3Report(db)
    return report.generate(year, month)


@router.get("/sss-r3/csv")
async def export_sss_r3_csv(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export SSS R3 report to CSV (Admin only)."""
    report = SSSR3Report(db)
    csv_data = report.to_csv(year, month)

    filename = f"sss_r3_{year}_{month:02d}.csv"
    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/sss-r3/txt")
async def export_sss_r3_text(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    employer_sss_no: str = Query("", description="Employer SSS Number"),
    employer_name: str = Query("", description="Employer Name"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export SSS R3 report to text file format (Admin only)."""
    report = SSSR3Report(db)
    text_data = report.to_r3_format(year, month, employer_sss_no, employer_name)

    filename = f"sss_r3_{year}_{month:02d}.txt"
    return StreamingResponse(
        iter([text_data.getvalue()]),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================== PhilHealth RF-1 Report ==================

@router.get("/philhealth-rf1")
async def get_philhealth_rf1_report(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get PhilHealth RF-1 (Remittance Report) data (Admin only)."""
    report = PhilHealthRF1Report(db)
    return report.generate(year, month)


@router.get("/philhealth-rf1/csv")
async def export_philhealth_rf1_csv(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export PhilHealth RF-1 report to CSV (Admin only)."""
    report = PhilHealthRF1Report(db)
    csv_data = report.to_csv(year, month)

    filename = f"philhealth_rf1_{year}_{month:02d}.csv"
    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/philhealth-rf1/txt")
async def export_philhealth_rf1_text(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    employer_philhealth_no: str = Query("", description="Employer PhilHealth Number"),
    employer_name: str = Query("", description="Employer Name"),
    address: str = Query("", description="Employer Address"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export PhilHealth RF-1 report to text file format (Admin only)."""
    report = PhilHealthRF1Report(db)
    text_data = report.to_rf1_format(year, month, employer_philhealth_no, employer_name, address)

    filename = f"philhealth_rf1_{year}_{month:02d}.txt"
    return StreamingResponse(
        iter([text_data.getvalue()]),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================== Pag-IBIG MCR Report ==================

@router.get("/pagibig-mcr")
async def get_pagibig_mcr_report(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get Pag-IBIG MCR (Monthly Collection Report) data (Admin only)."""
    report = PagIBIGMCRReport(db)
    return report.generate(year, month)


@router.get("/pagibig-mcr/csv")
async def export_pagibig_mcr_csv(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export Pag-IBIG MCR report to CSV (Admin only)."""
    report = PagIBIGMCRReport(db)
    csv_data = report.to_csv(year, month)

    filename = f"pagibig_mcr_{year}_{month:02d}.csv"
    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/pagibig-mcr/txt")
async def export_pagibig_mcr_text(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    employer_pagibig_no: str = Query("", description="Employer Pag-IBIG Number"),
    employer_name: str = Query("", description="Employer Name"),
    address: str = Query("", description="Employer Address"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export Pag-IBIG MCR report to text file format (Admin only)."""
    report = PagIBIGMCRReport(db)
    text_data = report.to_mcr_format(year, month, employer_pagibig_no, employer_name, address)

    filename = f"pagibig_mcr_{year}_{month:02d}.txt"
    return StreamingResponse(
        iter([text_data.getvalue()]),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================== Available Reports ==================

@router.get("/")
async def list_available_reports(
    current_admin: User = Depends(get_current_admin)
):
    """List all available reports."""
    return {
        "reports": [
            {
                "id": "payroll-summary",
                "name": "Monthly Payroll Summary",
                "description": "Summary of payroll by department with government contribution totals",
                "parameters": ["year", "month", "department (optional)"],
                "formats": ["json", "csv"]
            },
            {
                "id": "attendance",
                "name": "Attendance Report",
                "description": "Attendance summary with late, absent, and overtime tracking",
                "parameters": ["start_date", "end_date", "employee_id (optional)", "department (optional)"],
                "formats": ["json", "csv"]
            },
            {
                "id": "sss-r3",
                "name": "SSS R3 (Monthly Contribution Report)",
                "description": "Monthly SSS contributions for all employees",
                "parameters": ["year", "month"],
                "formats": ["json", "csv", "txt"]
            },
            {
                "id": "philhealth-rf1",
                "name": "PhilHealth RF-1 (Remittance Report)",
                "description": "Monthly PhilHealth premium contributions",
                "parameters": ["year", "month"],
                "formats": ["json", "csv", "txt"]
            },
            {
                "id": "pagibig-mcr",
                "name": "Pag-IBIG MCR (Monthly Collection Report)",
                "description": "Monthly Pag-IBIG fund contributions",
                "parameters": ["year", "month"],
                "formats": ["json", "csv", "txt"]
            }
        ]
    }
