"""
Attendance API Endpoints
========================
Attendance management, imports, and corrections.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

from app.api.deps import get_db, get_current_admin, get_current_user
from app.models.user import User, Role
from app.models.attendance import Shift, ProcessedAttendance, CorrectionRequest, CorrectionStatus, ImportBatch, ImportRecord
from app.schemas.attendance import (
    ShiftCreate, ShiftUpdate, ShiftResponse,
    AttendanceResponse, AttendanceDailySummary,
    CorrectionRequestCreate, CorrectionRequestResponse, CorrectionReviewRequest,
    DeviceCreate, DeviceResponse
)

router = APIRouter()


# === Shifts ===

@router.get("/shifts", response_model=List[ShiftResponse])
async def list_shifts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all shifts."""
    shifts = db.query(Shift).filter(Shift.is_active == True).all()
    return [ShiftResponse.model_validate(s) for s in shifts]


@router.post("/shifts", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    shift_data: ShiftCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new shift (Admin only)."""
    existing = db.query(Shift).filter(Shift.code == shift_data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Shift code already exists")

    shift = Shift(**shift_data.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return ShiftResponse.model_validate(shift)


@router.get("/shifts/{shift_id}", response_model=ShiftResponse)
async def get_shift(
    shift_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get shift by ID."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    return ShiftResponse.model_validate(shift)


@router.patch("/shifts/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: int,
    shift_data: ShiftUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a shift (Admin only)."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    update_data = shift_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(shift, field, value)

    db.commit()
    db.refresh(shift)
    return ShiftResponse.model_validate(shift)


@router.delete("/shifts/{shift_id}")
async def delete_shift(
    shift_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete shift (Admin only). Soft delete - sets is_active to False."""
    from app.models.employee import Employee

    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Check if any active employees are using this shift
    active_employees = db.query(Employee).filter(
        Employee.shift_id == shift_id,
        Employee.is_active == True
    ).count()

    if active_employees > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete shift with {active_employees} active employee(s). Reassign them first."
        )

    shift.is_active = False
    db.commit()
    return {"message": "Shift deleted"}


# === Attendance Records ===

@router.get("")
async def list_attendance(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    employee_id: Optional[int] = None,
    has_exception: Optional[bool] = None,
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List attendance records.
    Employees can only see their own records.
    """
    from app.models.employee import Employee

    query = db.query(ProcessedAttendance).join(Employee)

    # Non-admin can only see their own
    if current_user.role != Role.ADMIN:
        if current_user.employee_id:
            query = query.filter(ProcessedAttendance.employee_id == current_user.employee_id)
        else:
            return {"items": [], "total": 0, "page": page, "page_size": page_size}
    elif employee_id:
        query = query.filter(ProcessedAttendance.employee_id == employee_id)

    if date_from:
        query = query.filter(ProcessedAttendance.date >= date_from)
    if date_to:
        query = query.filter(ProcessedAttendance.date <= date_to)
    if has_exception is not None:
        query = query.filter(ProcessedAttendance.has_exception == has_exception)

    # Get total count
    total = query.count()

    # Get paginated results
    offset = (page - 1) * page_size
    attendance_records = query.order_by(ProcessedAttendance.date.desc()).offset(offset).limit(page_size).all()

    # Build response with employee info
    items = []
    for record in attendance_records:
        items.append({
            "id": record.id,
            "employee_id": record.employee_id,
            "employee_name": record.employee.full_name if record.employee else "Unknown",
            "employee_no": record.employee.employee_no if record.employee else "",
            "date": record.date.isoformat(),
            "time_in": record.time_in.strftime("%I:%M %p") if record.time_in else None,
            "time_out": record.time_out.strftime("%I:%M %p") if record.time_out else None,
            "worked_minutes": record.worked_minutes,
            "worked_hours": round(record.worked_minutes / 60, 2) if record.worked_minutes else 0,
            "late_minutes": record.late_minutes,
            "overtime_minutes": record.overtime_minutes,
            "status": record.status.value if record.status else "incomplete",
            "has_exception": record.has_exception,
            "exceptions": record.exceptions or []
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/summary", response_model=AttendanceDailySummary)
async def get_attendance_summary(
    date_filter: date = Query(..., alias="date"),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get daily attendance summary (Admin only)."""
    # TODO: Implement summary calculation
    return AttendanceDailySummary(
        date=date_filter,
        total_employees=0,
        present=0,
        absent=0,
        late=0,
        with_exceptions=0
    )


# === File Import ===

@router.get("/imports")
async def list_imports(
    page: int = 1,
    page_size: int = 20,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List import history (Admin only)."""
    query = db.query(ImportBatch).order_by(ImportBatch.created_at.desc())

    total = query.count()
    offset = (page - 1) * page_size
    batches = query.offset(offset).limit(page_size).all()

    items = []
    for batch in batches:
        items.append({
            "id": batch.id,
            "batch_id": batch.batch_id,
            "filename": batch.filename,
            "total_records": batch.total_records,
            "imported": batch.imported,
            "updated": batch.updated,
            "skipped": batch.skipped,
            "employees_found": batch.employees_found,
            "date_from": batch.date_from.isoformat() if batch.date_from else None,
            "date_to": batch.date_to.isoformat() if batch.date_to else None,
            "imported_by": batch.user.first_name + " " + batch.user.last_name if batch.user else "Unknown",
            "created_at": batch.created_at.isoformat() if batch.created_at else None
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/imports/{batch_id}")
async def get_import_detail(
    batch_id: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get details of a specific import batch (Admin only)."""
    batch = db.query(ImportBatch).filter(ImportBatch.batch_id == batch_id).first()

    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    # Get all records for this batch
    records = db.query(ImportRecord).filter(ImportRecord.batch_id == batch.id).all()

    record_list = []
    for r in records:
        record_list.append({
            "employee_name": r.employee_name,
            "employee_biometric_id": r.employee_biometric_id,
            "date": r.date.isoformat() if r.date else None,
            "day_name": r.day_name,
            "time_in": r.time_in,
            "time_out": r.time_out,
            "worked_minutes": r.worked_minutes,
            "daily_total_hours": float(r.daily_total_hours) if r.daily_total_hours else 0,
            "note": r.note,
            "status": r.status,
            "exceptions": r.exceptions or [],
            "has_exception": r.has_exception
        })

    return {
        "batch_id": batch.batch_id,
        "filename": batch.filename,
        "summary": {
            "total_records": batch.total_records,
            "imported": batch.imported,
            "updated": batch.updated,
            "skipped": batch.skipped,
            "employees_found": batch.employees_found
        },
        "date_from": batch.date_from.isoformat() if batch.date_from else None,
        "date_to": batch.date_to.isoformat() if batch.date_to else None,
        "imported_by": batch.user.first_name + " " + batch.user.last_name if batch.user else "Unknown",
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "records": record_list
    }


@router.delete("/imports/{batch_id}")
async def delete_import(
    batch_id: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete an import batch and its records (Admin only)."""
    batch = db.query(ImportBatch).filter(ImportBatch.batch_id == batch_id).first()

    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    db.delete(batch)
    db.commit()

    return {"message": "Import batch deleted successfully"}


@router.post("/preview-employees")
async def preview_employees_from_file(
    file: UploadFile = File(...),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Preview employees that would be extracted from an XLS file.
    Shows which employees already exist and which are new.
    Does NOT import anything - just previews.
    """
    import os
    import tempfile
    from app.services.attendance_import import TimeReportParser
    from app.models.employee import Employee

    # Validate file extension
    filename = file.filename or "upload.xls"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ['.xls', '.xlsx']:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only XLS and XLSX files are supported."
        )

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Parse the file to extract employee names
        parser = TimeReportParser(tmp_path)
        records = parser.parse()

        # Get unique employees
        unique_employees = {}
        for r in records:
            key = (r['employee_name'], r['employee_biometric_id'])
            if key not in unique_employees:
                unique_employees[key] = {
                    'name': r['employee_name'],
                    'biometric_id': r['employee_biometric_id'],
                    'record_count': 0
                }
            unique_employees[key]['record_count'] += 1

        # Check which exist in database
        new_employees = []
        existing_employees = []

        for (name, bio_id), emp_data in unique_employees.items():
            # Check by biometric ID first
            existing = None
            if bio_id:
                existing = db.query(Employee).filter(Employee.biometric_id == bio_id).first()

            # Check by name if not found
            if not existing:
                from app.services.attendance_import import find_employee_by_name
                existing = find_employee_by_name(db, name)

            if existing:
                existing_employees.append({
                    'name': name,
                    'biometric_id': bio_id,
                    'record_count': emp_data['record_count'],
                    'existing_id': existing.id,
                    'existing_employee_no': existing.employee_no,
                    'existing_status': existing.status
                })
            else:
                new_employees.append({
                    'name': name,
                    'biometric_id': bio_id,
                    'record_count': emp_data['record_count']
                })

        return {
            "filename": filename,
            "total_records": len(records),
            "total_employees": len(unique_employees),
            "new_employees": new_employees,
            "existing_employees": existing_employees,
            "new_count": len(new_employees),
            "existing_count": len(existing_employees)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse file: {str(e)}"
        )
    finally:
        os.unlink(tmp_path)


@router.post("/import")
async def import_attendance_file(
    file: UploadFile = File(...),
    create_employees: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Import attendance data from file (Admin only).
    Supports XLS, XLSX formats (NGTimereport format).
    """
    import os
    import tempfile
    from app.services.attendance_import import import_time_report

    # Validate file extension
    filename = file.filename or "upload.xls"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ['.xls', '.xlsx']:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only XLS and XLSX files are supported."
        )

    # Check for duplicate import (same filename)
    existing_import = db.query(ImportBatch).filter(ImportBatch.filename == filename).first()
    if existing_import:
        raise HTTPException(
            status_code=400,
            detail=f"This file has already been imported on {existing_import.created_at.strftime('%b %d, %Y at %I:%M %p')}. Delete the previous import from History if you want to re-import."
        )

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Import the file
        result = import_time_report(
            db=db,
            file_path=tmp_path,
            create_employees=create_employees
        )

        # Save import batch to history
        records = result['records']
        date_from = min((r['date'] for r in records if r['date']), default=None)
        date_to = max((r['date'] for r in records if r['date']), default=None)

        import_batch = ImportBatch(
            batch_id=result['batch_id'],
            filename=filename,
            total_records=result['total_records'],
            imported=result['imported'],
            updated=result['updated'],
            skipped=result['skipped'],
            employees_found=result['employees_found'],
            date_from=date_from,
            date_to=date_to,
            imported_by=current_admin.id
        )
        db.add(import_batch)
        db.flush()

        # Save individual records
        for record in records:
            import_record = ImportRecord(
                batch_id=import_batch.id,
                employee_name=record['employee_name'],
                employee_biometric_id=record['employee_biometric_id'],
                date=record['date'],
                day_name=record['day_name'],
                time_in=record['time_in'].strftime("%I:%M %p") if record['time_in'] else None,
                time_out=record['time_out'].strftime("%I:%M %p") if record['time_out'] else None,
                worked_minutes=record['worked_minutes'],
                daily_total_hours=record['daily_total_hours'],
                note=record['note'],
                status=record['status'],
                exceptions=record['exceptions'] if record['exceptions'] else None,
                has_exception=record['has_exception']
            )
            db.add(import_record)

        db.commit()

        # Format records for response
        formatted_records = []
        for record in records:
            formatted_records.append({
                "employee_name": record['employee_name'],
                "employee_biometric_id": record['employee_biometric_id'],
                "date": record['date'].isoformat() if record['date'] else None,
                "day_name": record['day_name'],
                "time_in": record['time_in'].strftime("%I:%M %p") if record['time_in'] else None,
                "time_out": record['time_out'].strftime("%I:%M %p") if record['time_out'] else None,
                "worked_minutes": record['worked_minutes'],
                "daily_total_hours": record['daily_total_hours'],
                "note": record['note'],
                "status": record['status'],
                "exceptions": record['exceptions'],
                "has_exception": record['has_exception']
            })

        auto_fixed = result.get('auto_fixed', 0)
        message = f"Successfully imported {result['imported']} records, updated {result['updated']} records"
        if auto_fixed > 0:
            message += f". Auto-fixed {auto_fixed} records with duplicate/misaligned entries."

        return {
            "message": message,
            "filename": filename,
            "batch_id": result['batch_id'],
            "summary": {
                "total_records": result['total_records'],
                "imported": result['imported'],
                "updated": result['updated'],
                "skipped": result['skipped'],
                "auto_fixed": auto_fixed,
                "employees_found": result['employees_found'],
                "employees_created": result.get('employees_created', 0),
                "employees_existing": result.get('employees_existing', 0)
            },
            "records": formatted_records
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to import file: {str(e)}"
        )
    finally:
        # Clean up temp file
        os.unlink(tmp_path)


# === Corrections ===

@router.post("/corrections", response_model=CorrectionRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_correction_request(
    correction_data: CorrectionRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a correction request (Employee)."""
    # Verify attendance belongs to user's employee
    attendance = db.query(ProcessedAttendance).filter(
        ProcessedAttendance.id == correction_data.attendance_id
    ).first()

    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    if current_user.role != Role.ADMIN:
        if current_user.employee_id != attendance.employee_id:
            raise HTTPException(status_code=403, detail="Cannot request correction for another employee")

    correction = CorrectionRequest(
        employee_id=attendance.employee_id,
        attendance_id=correction_data.attendance_id,
        requested_time_in=correction_data.requested_time_in,
        requested_time_out=correction_data.requested_time_out,
        reason=correction_data.reason
    )
    db.add(correction)
    db.commit()
    db.refresh(correction)

    # TODO: Return proper response with employee info
    return correction


@router.get("/corrections/pending", response_model=List[CorrectionRequestResponse])
async def list_pending_corrections(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List pending correction requests (Admin only)."""
    corrections = db.query(CorrectionRequest).filter(
        CorrectionRequest.status == CorrectionStatus.PENDING
    ).all()
    return corrections


@router.post("/corrections/{correction_id}/review")
async def review_correction(
    correction_id: int,
    review_data: CorrectionReviewRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Approve or reject a correction request (Admin only)."""
    from datetime import datetime

    correction = db.query(CorrectionRequest).filter(
        CorrectionRequest.id == correction_id
    ).first()

    if not correction:
        raise HTTPException(status_code=404, detail="Correction request not found")

    if correction.status != CorrectionStatus.PENDING:
        raise HTTPException(status_code=400, detail="Correction already reviewed")

    correction.status = CorrectionStatus.APPROVED if review_data.approved else CorrectionStatus.REJECTED
    correction.reviewed_by = current_admin.id
    correction.reviewed_at = datetime.utcnow()
    correction.review_notes = review_data.notes

    # If approved, update the attendance record
    if review_data.approved:
        attendance = db.query(ProcessedAttendance).filter(
            ProcessedAttendance.id == correction.attendance_id
        ).first()
        if attendance:
            if correction.requested_time_in:
                attendance.time_in = correction.requested_time_in
            if correction.requested_time_out:
                attendance.time_out = correction.requested_time_out
            # TODO: Recalculate worked hours, late minutes, etc.

    db.commit()

    return {"message": f"Correction {'approved' if review_data.approved else 'rejected'}"}
