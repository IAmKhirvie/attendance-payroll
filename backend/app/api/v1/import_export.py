"""
Import/Export API Endpoints
===========================
API endpoints for bulk import and export operations.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional

from app.api.deps import get_db, get_current_admin
from app.models.user import User
from app.services.import_export import get_import_export_service

router = APIRouter()


# ================== Employee Import/Export ==================

@router.get("/employees/template")
async def download_employee_template(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Download CSV template for employee import (Admin only)."""
    service = get_import_export_service(db)
    csv_data = service.get_employee_import_template()

    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=employee_import_template.csv"}
    )


@router.post("/employees/import")
async def import_employees(
    file: UploadFile = File(...),
    update_existing: bool = Query(False, description="Update existing employees"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Import employees from CSV file (Admin only).

    The CSV should have headers matching the template.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    try:
        csv_content = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            csv_content = content.decode('latin-1')
        except:
            raise HTTPException(status_code=400, detail="Unable to decode file. Please use UTF-8 encoding.")

    service = get_import_export_service(db)
    result = service.import_employees(csv_content, update_existing)

    return result


@router.get("/employees/export")
async def export_employees(
    department: Optional[str] = Query(None, description="Filter by department"),
    status: Optional[str] = Query(None, description="Filter by status"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export employees to CSV (Admin only)."""
    service = get_import_export_service(db)
    csv_data = service.export_employees(department, status)

    filename = f"employees_export_{__import__('datetime').date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================== Payroll Export ==================

@router.get("/payroll/{run_id}/export")
async def export_payroll_run(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export payroll run data to CSV (Admin only)."""
    service = get_import_export_service(db)

    try:
        csv_data = service.export_payroll_run(run_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = f"payroll_run_{run_id}.csv"
    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================== Bank File Generation ==================

@router.get("/payroll/{run_id}/bank-file")
async def generate_bank_file(
    run_id: int,
    format: str = Query("generic", description="Bank format: generic, bpi, bdo, metrobank"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Generate bank file for direct deposit (Admin only).

    Supported formats:
    - generic: Standard format with all details
    - bpi: BPI bank format
    - bdo: BDO bank format
    """
    service = get_import_export_service(db)

    try:
        csv_data = service.generate_bank_file(run_id, format)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = f"bank_file_{format}_{run_id}.csv"
    return StreamingResponse(
        iter([csv_data.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ================== Available Operations ==================

@router.get("/")
async def list_import_export_options(
    current_admin: User = Depends(get_current_admin)
):
    """List available import/export operations."""
    return {
        "import": [
            {
                "id": "employees",
                "name": "Employee Bulk Import",
                "description": "Import employees from CSV file",
                "template_endpoint": "/api/v1/import-export/employees/template",
                "import_endpoint": "/api/v1/import-export/employees/import",
            }
        ],
        "export": [
            {
                "id": "employees",
                "name": "Employees Export",
                "description": "Export all employees to CSV",
                "endpoint": "/api/v1/import-export/employees/export",
            },
            {
                "id": "payroll",
                "name": "Payroll Run Export",
                "description": "Export payroll run data to CSV",
                "endpoint": "/api/v1/import-export/payroll/{run_id}/export",
            },
            {
                "id": "bank-file",
                "name": "Bank File Generation",
                "description": "Generate bank file for direct deposit",
                "endpoint": "/api/v1/import-export/payroll/{run_id}/bank-file",
                "formats": ["generic", "bpi", "bdo"],
            }
        ]
    }
