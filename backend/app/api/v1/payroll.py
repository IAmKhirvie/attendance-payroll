"""
Payroll API Endpoints
=====================
Payroll runs, payslips, 13th month pay, PDF generation, and deduction configuration.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import extract
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
import io
import os
import tempfile

from app.api.deps import get_db, get_current_admin, get_current_user
from app.models.user import User, Role
from app.models.payroll import PayrollRun, Payslip, DeductionConfig, PayrollStatus, PayrollSettings, ThirteenthMonthPay
from app.models.employee import Employee
from app.schemas.payroll import (
    PayrollRunCreate, PayrollRunResponse, PayrollRunListResponse,
    PayslipResponse, PayslipListResponse, PayslipAdjustRequest,
    DeductionConfigCreate, DeductionConfigUpdate, DeductionConfigResponse,
    PayrollSettingsUpdate, PayrollSettingsResponse
)

router = APIRouter()


def generate_coded_filename(payslip: Payslip, extension: str = "pdf") -> str:
    """
    Generate a coded filename for payslip downloads.
    Format: REC-{initials}{emp_short}-{YYMM}{cutoff}.{ext}
    Example: REC-GT02-2601A.pdf (Gemma Termulo, emp ending in 02, Jan 2026, 1st cutoff)
    """
    # Get initials from name
    if payslip.employee:
        names = payslip.employee.full_name.split()
        initials = ''.join(n[0].upper() for n in names if n)[:3]  # Max 3 initials
        # Get last 2 digits of employee number
        emp_no = payslip.employee.employee_no or "00"
        emp_short = ''.join(filter(str.isdigit, emp_no))[-2:] or "00"
    else:
        initials = "XX"
        emp_short = "00"

    # Get period code (YYMM)
    if payslip.payroll_run:
        period_code = payslip.payroll_run.period_start.strftime('%y%m')
        cutoff = 'A' if payslip.payroll_run.cutoff == 1 else 'B'
    else:
        period_code = "0000"
        cutoff = "X"

    return f"REC-{initials}{emp_short}-{period_code}{cutoff}.{extension}"


def generate_coded_sheet_filename(payroll_run: PayrollRun, page: int) -> str:
    """
    Generate a coded filename for payslip sheet downloads.
    Format: BATCH-{YYMM}{cutoff}-P{page}.png
    Example: BATCH-2601A-P1.png
    """
    period_code = payroll_run.period_start.strftime('%y%m')
    cutoff = 'A' if payroll_run.cutoff == 1 else 'B'
    return f"BATCH-{period_code}{cutoff}-P{page}.png"


# === Deduction Configuration ===

@router.get("/deductions", response_model=List[DeductionConfigResponse])
async def list_deduction_configs(
    include_inactive: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all deduction configurations (Admin only)."""
    query = db.query(DeductionConfig)
    if not include_inactive:
        query = query.filter(DeductionConfig.is_enabled == True)
    configs = query.order_by(DeductionConfig.deduction_type).all()
    return [DeductionConfigResponse.model_validate(c) for c in configs]


@router.post("/deductions", response_model=DeductionConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_deduction_config(
    config_data: DeductionConfigCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new deduction configuration (Admin only)."""
    existing = db.query(DeductionConfig).filter(DeductionConfig.code == config_data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Deduction code already exists")

    # Convert salary brackets to dict if present
    data = config_data.model_dump()
    if data.get('salary_brackets'):
        data['salary_brackets'] = [b.model_dump() if hasattr(b, 'model_dump') else b for b in data['salary_brackets']]

    config = DeductionConfig(**data, updated_by=current_admin.id)
    db.add(config)
    db.commit()
    db.refresh(config)
    return DeductionConfigResponse.model_validate(config)


@router.get("/deductions/{config_id}", response_model=DeductionConfigResponse)
async def get_deduction_config(
    config_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get deduction configuration by ID (Admin only)."""
    config = db.query(DeductionConfig).filter(DeductionConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Deduction config not found")
    return DeductionConfigResponse.model_validate(config)


@router.patch("/deductions/{config_id}", response_model=DeductionConfigResponse)
async def update_deduction_config(
    config_id: int,
    config_data: DeductionConfigUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a deduction configuration (Admin only)."""
    config = db.query(DeductionConfig).filter(DeductionConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Deduction config not found")

    update_data = config_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)
    config.updated_by = current_admin.id

    db.commit()
    db.refresh(config)
    return DeductionConfigResponse.model_validate(config)


@router.delete("/deductions/{config_id}")
async def delete_deduction_config(
    config_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete deduction configuration (Admin only). Soft delete - disables the config."""
    config = db.query(DeductionConfig).filter(DeductionConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Deduction config not found")

    # Soft delete - just disable it
    config.is_enabled = False
    config.updated_by = current_admin.id
    db.commit()

    return {"message": "Deduction configuration deleted"}


# === Payroll Runs ===

@router.get("/runs", response_model=PayrollRunListResponse)
async def list_payroll_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[PayrollStatus] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List payroll runs (Admin only). Excludes soft-deleted runs."""
    query = db.query(PayrollRun).filter(PayrollRun.is_deleted == False)
    if status_filter:
        query = query.filter(PayrollRun.status == status_filter)

    total = query.count()
    runs = query.order_by(PayrollRun.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return PayrollRunListResponse(
        items=[PayrollRunResponse.model_validate(r) for r in runs],
        total=total,
        page=page,
        page_size=page_size
    )


@router.post("/runs", response_model=PayrollRunResponse, status_code=status.HTTP_201_CREATED)
async def create_payroll_run(
    run_data: PayrollRunCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new payroll run (Admin only)."""
    # Check for overlapping period
    existing = db.query(PayrollRun).filter(
        PayrollRun.period_start <= run_data.period_end,
        PayrollRun.period_end >= run_data.period_start
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Overlapping payroll period exists (ID: {existing.id})"
        )

    data = run_data.model_dump()
    run = PayrollRun(
        period_start=data['period_start'],
        period_end=data['period_end'],
        cutoff=data.get('cutoff', 1),
        pay_date=data.get('pay_date'),
        description=data.get('description'),
        enabled_deductions=data.get('enabled_deductions'),
        run_by=current_admin.id
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return PayrollRunResponse.model_validate(run)


@router.get("/runs/{run_id}", response_model=PayrollRunResponse)
async def get_payroll_run(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get payroll run details (Admin only). Returns 404 for deleted runs."""
    run = db.query(PayrollRun).filter(
        PayrollRun.id == run_id,
        PayrollRun.is_deleted == False
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    return PayrollRunResponse.model_validate(run)


@router.patch("/runs/{run_id}", response_model=PayrollRunResponse)
async def update_payroll_run(
    run_id: int,
    run_data: PayrollRunCreate,
    force: bool = False,
    reason: Optional[str] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update payroll run (Admin only). Use force=true with reason for non-DRAFT runs."""
    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    if run.status != PayrollStatus.DRAFT:
        if not force:
            raise HTTPException(
                status_code=400,
                detail=f"Payroll run is {run.status}. Use force=true to update."
            )
        if not reason:
            raise HTTPException(
                status_code=400,
                detail="A reason is required to edit non-DRAFT payroll runs."
            )
        # Log the forced edit
        from app.services.audit_service import AuditService
        from app.models.audit import AuditAction
        audit = AuditService(db)
        audit.log(
            action=AuditAction.PAYROLL_RUN,
            resource_type="payroll_run",
            user_id=current_admin.id,
            user_email=current_admin.email,
            resource_id=str(run_id),
            reason=reason,
            metadata={"action": "FORCE_EDIT", "original_status": str(run.status)}
        )

    # Check for overlapping period (exclude current run)
    existing = db.query(PayrollRun).filter(
        PayrollRun.id != run_id,
        PayrollRun.period_start <= run_data.period_end,
        PayrollRun.period_end >= run_data.period_start
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Overlapping payroll period exists (ID: {existing.id})"
        )

    update_data = run_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(run, field, value)

    db.commit()
    db.refresh(run)
    return PayrollRunResponse.model_validate(run)


@router.delete("/runs/{run_id}")
async def delete_payroll_run(
    run_id: int,
    force: bool = False,
    reason: Optional[str] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Soft delete payroll run (Admin only).

    Moves the payroll run to trash instead of permanently deleting.
    Requires a deletion reason. Use force=true with reason for non-DRAFT runs.
    """
    run = db.query(PayrollRun).filter(
        PayrollRun.id == run_id,
        PayrollRun.is_deleted == False
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    # Require a reason for deletion
    if not reason or not reason.strip():
        raise HTTPException(
            status_code=400,
            detail="A deletion reason is required."
        )

    if run.status != PayrollStatus.DRAFT:
        if not force:
            raise HTTPException(
                status_code=400,
                detail=f"Payroll run is {run.status.value}. Use force=true to delete."
            )

    # Log the deletion
    from app.services.audit_service import AuditService
    from app.models.audit import AuditAction
    audit = AuditService(db)
    audit.log(
        action=AuditAction.PAYROLL_RUN,
        resource_type="payroll_run",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(run_id),
        reason=reason,
        metadata={
            "action": "SOFT_DELETE",
            "status": str(run.status.value),
            "employee_count": run.employee_count
        }
    )

    # Soft delete - mark as deleted instead of removing
    run.is_deleted = True
    run.deleted_at = datetime.utcnow()
    run.deleted_by = current_admin.id
    run.deletion_reason = reason

    db.commit()

    return {
        "message": "Payroll run moved to trash",
        "run_id": run_id
    }


@router.get("/runs/trash")
async def list_deleted_payroll_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List deleted (trashed) payroll runs (Admin only).

    Returns payroll runs that have been soft deleted, including:
    - Deletion reason
    - Who deleted it
    - When it was deleted
    """
    from app.models.user import User as UserModel

    query = db.query(PayrollRun).filter(PayrollRun.is_deleted == True)

    total = query.count()
    runs = query.order_by(PayrollRun.deleted_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    items = []
    for run in runs:
        # Get deleted by user info
        deleted_by_user = None
        if run.deleted_by:
            user = db.query(UserModel).filter(UserModel.id == run.deleted_by).first()
            if user:
                deleted_by_user = {"id": user.id, "email": user.email}

        items.append({
            "id": run.id,
            "period_start": run.period_start.isoformat(),
            "period_end": run.period_end.isoformat(),
            "pay_date": run.pay_date.isoformat() if run.pay_date else None,
            "cutoff": run.cutoff,
            "description": run.description,
            "status": run.status.value,
            "total_gross": float(run.total_gross) if run.total_gross else 0,
            "total_deductions": float(run.total_deductions) if run.total_deductions else 0,
            "total_net": float(run.total_net) if run.total_net else 0,
            "employee_count": run.employee_count,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            # Deletion info
            "deleted_at": run.deleted_at.isoformat() if run.deleted_at else None,
            "deleted_by": deleted_by_user,
            "deletion_reason": run.deletion_reason
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.post("/runs/{run_id}/restore")
async def restore_payroll_run(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Restore a deleted payroll run from trash (Admin only).

    This brings back a soft-deleted payroll run and its payslips.
    """
    run = db.query(PayrollRun).filter(
        PayrollRun.id == run_id,
        PayrollRun.is_deleted == True
    ).first()

    if not run:
        raise HTTPException(status_code=404, detail="Deleted payroll run not found")

    # Log the restore
    from app.services.audit_service import AuditService
    from app.models.audit import AuditAction
    audit = AuditService(db)
    audit.log(
        action=AuditAction.PAYROLL_RUN,
        resource_type="payroll_run",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(run_id),
        reason=f"Restored from trash. Original deletion reason: {run.deletion_reason[:200] if run.deletion_reason else 'N/A'}...",
        metadata={"action": "RESTORE", "original_deleted_at": run.deleted_at.isoformat() if run.deleted_at else None}
    )

    # Restore the payroll run
    run.is_deleted = False
    run.deleted_at = None
    run.deleted_by = None
    # Keep deletion_reason for audit trail
    run.deletion_reason = f"[RESTORED] {run.deletion_reason}" if run.deletion_reason else None

    db.commit()

    return {
        "message": "Payroll run restored successfully",
        "run_id": run_id
    }


@router.delete("/runs/{run_id}/permanent")
async def permanently_delete_payroll_run(
    run_id: int,
    confirm: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Permanently delete a payroll run from trash (Admin only).

    WARNING: This action cannot be undone!

    Must set confirm=true to proceed.
    Only works on already-deleted (trashed) payroll runs.
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Must set confirm=true to permanently delete. This action cannot be undone!"
        )

    run = db.query(PayrollRun).filter(
        PayrollRun.id == run_id,
        PayrollRun.is_deleted == True
    ).first()

    if not run:
        raise HTTPException(status_code=404, detail="Deleted payroll run not found in trash")

    # Log the permanent deletion
    from app.services.audit_service import AuditService
    from app.models.audit import AuditAction
    audit = AuditService(db)
    audit.log(
        action=AuditAction.PAYROLL_RUN,
        resource_type="payroll_run",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(run_id),
        reason=f"Permanently deleted. Original deletion reason: {run.deletion_reason[:500] if run.deletion_reason else 'N/A'}",
        metadata={
            "action": "PERMANENT_DELETE",
            "period_start": run.period_start.isoformat(),
            "period_end": run.period_end.isoformat(),
            "employee_count": run.employee_count,
            "status": run.status.value
        }
    )

    # Delete associated payslips first
    payslip_count = db.query(Payslip).filter(Payslip.payroll_run_id == run_id).count()
    db.query(Payslip).filter(Payslip.payroll_run_id == run_id).delete()

    # Permanently delete the payroll run
    db.delete(run)
    db.commit()

    return {
        "message": f"Payroll run permanently deleted ({payslip_count} payslips removed)",
        "run_id": run_id
    }


@router.post("/validate-reason")
async def validate_deletion_reason_endpoint(
    reason: str,
    min_words: int = 100,
    current_admin: User = Depends(get_current_admin)
):
    """
    Validate deletion reason text (Admin only).

    Checks if the reason meets requirements:
    - Minimum 100 valid English words (4+ letters)
    - Words must be recognizable English words

    Returns validation result and word statistics.
    """
    from app.services.word_validator import validate_deletion_reason, get_word_count_stats

    is_valid, error_msg, stats = validate_deletion_reason(reason, min_words=min_words)

    return {
        "is_valid": is_valid,
        "error_message": error_msg if not is_valid else None,
        "stats": stats,
        "requirements": {
            "min_words": min_words,
            "min_word_length": 4,
            "max_invalid_ratio": 0.2
        }
    }


@router.post("/runs/{run_id}/process")
async def process_payroll_run(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Process payroll calculations (Admin only)."""
    from datetime import datetime
    from app.services.payroll_calculator import process_payroll

    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    if run.status not in [PayrollStatus.DRAFT, PayrollStatus.REVIEW]:
        raise HTTPException(status_code=400, detail="Payroll run cannot be processed")

    run.status = PayrollStatus.PROCESSING
    run.run_by = current_admin.id
    run.run_at = datetime.utcnow()
    db.commit()

    try:
        # Process payroll using calculator service
        result = process_payroll(db, run)

        return {
            "message": "Payroll processed successfully",
            "status": run.status.value,
            "summary": result
        }
    except Exception as e:
        run.status = PayrollStatus.DRAFT
        db.commit()
        raise HTTPException(status_code=500, detail=f"Payroll processing failed: {str(e)}")


@router.post("/runs/{run_id}/lock")
async def lock_payroll_run(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lock a payroll run (Admin only). Locked runs cannot be modified."""
    from datetime import datetime

    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    if run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Payroll run already locked")

    run.status = PayrollStatus.LOCKED
    run.locked_by = current_admin.id
    run.locked_at = datetime.utcnow()
    db.commit()

    return {"message": "Payroll run locked"}


@router.post("/runs/{run_id}/recalculate")
async def recalculate_payroll_run(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Recalculate all payslips in a payroll run using current employee salaries.
    This updates basic_semi, daily rates, and recalculates deductions.
    """
    from decimal import Decimal
    from sqlalchemy.orm.attributes import flag_modified
    from app.services.payroll_calculator import get_payroll_settings, calculate_ican_daily_rate, calculate_ican_minute_rate

    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    if run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot recalculate locked payroll")

    # Get all payslips for this run
    payslips = db.query(Payslip).filter(Payslip.payroll_run_id == run_id).all()
    if not payslips:
        raise HTTPException(status_code=400, detail="No payslips found in this payroll run")

    settings = get_payroll_settings(db)
    updated_count = 0
    total_gross = Decimal('0')
    total_deductions = Decimal('0')
    total_net = Decimal('0')

    for payslip in payslips:
        employee = db.query(Employee).filter(Employee.id == payslip.employee_id).first()
        if not employee:
            continue

        # Get employee's current basic salary
        monthly_basic = float(employee.basic_salary or 0)
        basic_semi = monthly_basic / 2

        # Get work hours for this employee
        work_hours = float(employee.work_hours_per_day or settings.work_hours_per_day or 8)

        # Calculate rates using ICAN formula
        working_days = settings.working_days_per_year or 261
        daily_rate = calculate_ican_daily_rate(monthly_basic, working_days)
        minute_rate = calculate_ican_minute_rate(daily_rate, work_hours)

        # Update earnings
        current_earnings = dict(payslip.earnings or {})
        current_earnings['basic_semi'] = basic_semi
        current_earnings['allowance_semi'] = float(employee.allowance or 0) / 2
        current_earnings['productivity_incentive_semi'] = float(employee.productivity_incentive or 0) / 2
        current_earnings['language_incentive_semi'] = float(employee.language_incentive or 0) / 2

        # Calculate absent deduction
        days_absent = float(payslip.days_absent or 0)
        absent_deduction = days_absent * daily_rate
        current_earnings['absent_deduction'] = absent_deduction

        # Calculate late deduction
        late_minutes = float(payslip.total_late_minutes or 0)
        late_deduction = late_minutes * minute_rate
        current_earnings['late_deduction'] = late_deduction

        # Store calculation info
        current_earnings['_calculation_info'] = {
            'monthly_basic': monthly_basic,
            'work_hours_per_day': work_hours,
        }

        payslip.earnings = current_earnings
        flag_modified(payslip, 'earnings')

        # Update deductions with rates and current employee values
        current_deductions = dict(payslip.deductions or {})
        current_deductions['absences_daily_rate_used'] = daily_rate
        current_deductions['late_minute_rate_used'] = minute_rate
        current_deductions['work_hours_per_day_used'] = work_hours
        current_deductions['absences_amount'] = absent_deduction
        current_deductions['late_amount'] = late_deduction

        # Update government deductions from employee's current values
        current_deductions['sss'] = float(employee.sss_contribution or 0)
        current_deductions['philhealth'] = float(employee.philhealth_contribution or 0)
        current_deductions['pagibig'] = float(employee.pagibig_contribution or 0)
        current_deductions['tax'] = float(employee.tax_amount or 0)

        payslip.deductions = current_deductions
        flag_modified(payslip, 'deductions')

        # Recalculate totals
        total_earnings = Decimal('0')
        for k, v in current_earnings.items():
            if k.startswith('_') or k in ['absent_deduction', 'late_deduction']:
                continue
            if v is not None:
                try:
                    total_earnings += Decimal(str(v))
                except:
                    pass
        # Subtract deductions from earnings
        total_earnings -= Decimal(str(absent_deduction))
        total_earnings -= Decimal(str(late_deduction))
        payslip.total_earnings = total_earnings

        # Calculate total deductions (government + loans)
        ded_total = Decimal('0')
        for f in ['sss', 'philhealth', 'pagibig', 'tax', 'loans']:
            v = current_deductions.get(f, 0)
            if v:
                try:
                    ded_total += Decimal(str(v))
                except:
                    pass
        payslip.total_deductions = ded_total

        # Calculate net pay
        payslip.net_pay = payslip.total_earnings - payslip.total_deductions

        total_gross += payslip.total_earnings
        total_deductions += payslip.total_deductions
        total_net += payslip.net_pay
        updated_count += 1

    # Update payroll run totals
    run.total_gross = total_gross
    run.total_deductions = total_deductions
    run.total_net = total_net

    db.commit()

    return {
        "message": f"Recalculated {updated_count} payslips",
        "updated_count": updated_count,
        "total_gross": float(total_gross),
        "total_deductions": float(total_deductions),
        "total_net": float(total_net)
    }


# === Payslips ===

@router.get("/payslips")
async def list_payslips(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    payroll_run_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List payslips.
    Employees can only see their own released payslips.
    """
    from app.models.employee import Employee

    query = db.query(Payslip).join(Employee).join(PayrollRun)

    # Non-admin can only see their own released payslips
    if current_user.role != Role.ADMIN:
        if current_user.employee_id:
            query = query.filter(
                Payslip.employee_id == current_user.employee_id,
                Payslip.is_released == True
            )
        else:
            return {"items": [], "total": 0, "page": page, "page_size": page_size}
    else:
        if payroll_run_id:
            query = query.filter(Payslip.payroll_run_id == payroll_run_id)
        if employee_id:
            query = query.filter(Payslip.employee_id == employee_id)

    total = query.count()
    payslips = query.order_by(Payslip.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    items = []
    for p in payslips:
        items.append({
            "id": p.id,
            "payroll_run_id": p.payroll_run_id,
            "employee_id": p.employee_id,
            "employee_name": p.employee.full_name if p.employee else "Unknown",
            "employee_no": p.employee.employee_no if p.employee else "",
            "period_start": p.payroll_run.period_start.isoformat() if p.payroll_run else None,
            "period_end": p.payroll_run.period_end.isoformat() if p.payroll_run else None,
            "earnings": p.earnings,
            "deductions": p.deductions,
            "total_earnings": float(p.total_earnings),
            "total_deductions": float(p.total_deductions),
            "net_pay": float(p.net_pay),
            "days_worked": float(p.days_worked),
            "days_absent": float(p.days_absent),
            "late_count": p.late_count,
            "total_late_minutes": p.total_late_minutes,
            "overtime_hours": float(p.overtime_hours),
            "is_released": p.is_released,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/payslips/{payslip_id}")
async def get_payslip(
    payslip_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get payslip details."""
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Non-admin can only see their own
    if current_user.role != Role.ADMIN:
        if current_user.employee_id != payslip.employee_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not payslip.is_released:
            raise HTTPException(status_code=404, detail="Payslip not found")

    # Get employee schedule settings
    emp = payslip.employee
    employee_settings = {}
    if emp:
        employee_settings = {
            "call_time": emp.call_time or "08:00",
            "time_out": emp.time_out or "17:00",
            "buffer_minutes": emp.buffer_minutes if emp.buffer_minutes is not None else 10,
            "is_flexible": emp.is_flexible or False,
            "work_hours_per_day": float(emp.work_hours_per_day or 8),
            "basic_salary": float(emp.basic_salary or 0),
        }

    return {
        "id": payslip.id,
        "payroll_run_id": payslip.payroll_run_id,
        "employee_id": payslip.employee_id,
        "employee_name": payslip.employee.full_name if payslip.employee else "Unknown",
        "employee_no": payslip.employee.employee_no if payslip.employee else "",
        "period_start": payslip.payroll_run.period_start.isoformat() if payslip.payroll_run else None,
        "period_end": payslip.payroll_run.period_end.isoformat() if payslip.payroll_run else None,
        "earnings": payslip.earnings,
        "deductions": payslip.deductions,
        "total_earnings": float(payslip.total_earnings),
        "total_deductions": float(payslip.total_deductions),
        "net_pay": float(payslip.net_pay),
        "days_worked": float(payslip.days_worked),
        "days_absent": float(payslip.days_absent),
        "late_count": payslip.late_count,
        "total_late_minutes": payslip.total_late_minutes,
        "overtime_hours": float(payslip.overtime_hours),
        "adjustments": payslip.adjustments,
        "adjustment_notes": payslip.adjustment_notes,
        "is_released": payslip.is_released,
        "released_at": payslip.released_at.isoformat() if payslip.released_at else None,
        "created_at": payslip.created_at.isoformat() if payslip.created_at else None,
        "employee_settings": employee_settings
    }


@router.get("/payslips/{payslip_id}/attendance")
async def get_payslip_attendance(
    payslip_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get attendance records for the payslip period."""
    from app.models.attendance import ProcessedAttendance

    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Non-admin can only see their own
    if current_user.role != Role.ADMIN:
        if current_user.employee_id != payslip.employee_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not payslip.is_released:
            raise HTTPException(status_code=404, detail="Payslip not found")

    # Get payroll run period
    if not payslip.payroll_run:
        return {"records": [], "summary": {}}

    period_start = payslip.payroll_run.period_start
    period_end = payslip.payroll_run.period_end

    # Get attendance records for this employee and period
    records = db.query(ProcessedAttendance).filter(
        ProcessedAttendance.employee_id == payslip.employee_id,
        ProcessedAttendance.date >= period_start,
        ProcessedAttendance.date <= period_end
    ).order_by(ProcessedAttendance.date).all()

    # Calculate summary
    present_days = sum(1 for r in records if r.status and r.status.value in ['present', 'late'])
    absent_days = sum(1 for r in records if r.status and r.status.value == 'absent')
    late_count = sum(1 for r in records if r.late_minutes and r.late_minutes > 0)
    total_late_minutes = sum(r.late_minutes or 0 for r in records)
    total_overtime_minutes = sum(r.overtime_minutes or 0 for r in records)

    items = []
    for record in records:
        items.append({
            "id": record.id,
            "date": record.date.isoformat(),
            "time_in": record.time_in.strftime("%I:%M %p") if record.time_in else None,
            "time_out": record.time_out.strftime("%I:%M %p") if record.time_out else None,
            "worked_hours": round(record.worked_minutes / 60, 2) if record.worked_minutes else 0,
            "late_minutes": record.late_minutes or 0,
            "overtime_minutes": record.overtime_minutes or 0,
            "status": record.status.value if record.status else "incomplete"
        })

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "records": items,
        "summary": {
            "total_days": len(records),
            "present_days": present_days,
            "absent_days": absent_days,
            "late_count": late_count,
            "total_late_minutes": total_late_minutes,
            "total_overtime_minutes": total_overtime_minutes,
            "total_overtime_hours": round(total_overtime_minutes / 60, 2)
        }
    }


@router.post("/runs/{run_id}/release")
async def release_payslips(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Release all payslips in a payroll run (makes them visible to employees)."""
    from datetime import datetime

    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    if run.status not in [PayrollStatus.REVIEW, PayrollStatus.APPROVED, PayrollStatus.LOCKED]:
        raise HTTPException(status_code=400, detail="Payroll must be reviewed before releasing")

    # Release all payslips
    payslips = db.query(Payslip).filter(Payslip.payroll_run_id == run_id).all()
    for payslip in payslips:
        payslip.is_released = True
        payslip.released_at = datetime.utcnow()

    db.commit()

    return {"message": f"Released {len(payslips)} payslips to employees"}


@router.post("/payslips/{payslip_id}/adjust")
async def adjust_payslip(
    payslip_id: int,
    adjustment_data: PayslipAdjustRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Add manual adjustments to a payslip (Admin only)."""
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Check if payroll run is locked
    run = db.query(PayrollRun).filter(PayrollRun.id == payslip.payroll_run_id).first()
    if run and run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot modify locked payroll")

    # Add adjustments
    adjustments = [a.model_dump() for a in adjustment_data.adjustments]
    payslip.adjustments = adjustments
    payslip.adjustment_notes = adjustment_data.notes

    # Recalculate net pay
    # TODO: Implement proper recalculation

    db.commit()
    return {"message": "Adjustments saved"}


@router.patch("/payslips/{payslip_id}/earnings")
async def update_payslip_earnings(
    payslip_id: int,
    earnings: dict,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update payslip earnings (Admin only).
    HR can manually adjust any earnings field.
    """
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Check if locked
    run = db.query(PayrollRun).filter(PayrollRun.id == payslip.payroll_run_id).first()
    if run and run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot modify locked payroll")

    from decimal import Decimal
    from sqlalchemy.orm.attributes import flag_modified

    # Update earnings - create new dict to ensure SQLAlchemy detects change
    current_earnings = dict(payslip.earnings or {})
    current_earnings.update(earnings)
    payslip.earnings = current_earnings
    flag_modified(payslip, 'earnings')

    # Recalculate total earnings
    total = Decimal('0')
    for k, v in current_earnings.items():
        if v is not None:
            try:
                total += Decimal(str(v))
            except:
                pass
    payslip.total_earnings = total

    # Recalculate net pay
    payslip.net_pay = payslip.total_earnings - (payslip.total_deductions or Decimal('0'))

    db.commit()
    return {"message": "Earnings updated", "total_earnings": float(total), "net_pay": float(payslip.net_pay)}


@router.patch("/payslips/{payslip_id}/deductions")
async def update_payslip_deductions(
    payslip_id: int,
    deductions: dict,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update payslip deductions (Admin only).
    HR can manually adjust any deduction field.
    """
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Check if locked
    run = db.query(PayrollRun).filter(PayrollRun.id == payslip.payroll_run_id).first()
    if run and run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot modify locked payroll")

    from decimal import Decimal
    from sqlalchemy.orm.attributes import flag_modified

    # Update deductions - create new dict to ensure SQLAlchemy detects change
    current_deductions = dict(payslip.deductions or {})
    current_deductions.update(deductions)
    payslip.deductions = current_deductions
    flag_modified(payslip, 'deductions')

    # Recalculate total deductions (exclude non-amount fields)
    amount_fields = ['absences_amount', 'late_amount', 'sss', 'philhealth', 'pagibig', 'tax', 'loans']
    total = Decimal('0')
    for f in amount_fields:
        v = current_deductions.get(f, 0)
        if v is not None:
            try:
                total += Decimal(str(v))
            except:
                pass
    payslip.total_deductions = total

    # Recalculate net pay
    payslip.net_pay = (payslip.total_earnings or Decimal('0')) - payslip.total_deductions

    db.commit()
    return {"message": "Deductions updated", "total_deductions": float(total), "net_pay": float(payslip.net_pay)}


@router.patch("/payslips/{payslip_id}/attendance")
async def update_payslip_attendance(
    payslip_id: int,
    attendance: dict,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update payslip attendance data (Admin only).
    HR can manually adjust days worked, late count, overtime hours.
    Use this for teachers with partial schedules (e.g., only 2 days/week).
    """
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Check if locked
    run = db.query(PayrollRun).filter(PayrollRun.id == payslip.payroll_run_id).first()
    if run and run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot modify locked payroll")

    from decimal import Decimal

    # Update attendance fields
    if 'days_worked' in attendance:
        payslip.days_worked = attendance['days_worked']
    if 'days_absent' in attendance:
        payslip.days_absent = attendance['days_absent']
    if 'late_count' in attendance:
        payslip.late_count = attendance['late_count']
    if 'total_late_minutes' in attendance:
        payslip.total_late_minutes = attendance['total_late_minutes']
    if 'overtime_hours' in attendance:
        payslip.overtime_hours = attendance['overtime_hours']
    if 'undertime_minutes' in attendance:
        payslip.undertime_minutes = attendance['undertime_minutes']

    # Recalculate deductions based on new attendance (optional)
    if attendance.get('recalculate_deductions', False):
        employee = db.query(Employee).filter(Employee.id == payslip.employee_id).first()
        if employee:
            from app.services.payroll_calculator import get_payroll_settings, calculate_ican_daily_rate, calculate_ican_minute_rate
            from sqlalchemy.orm.attributes import flag_modified
            settings = get_payroll_settings(db)
            monthly_basic = float(employee.basic_salary or 0)

            # Use work hours from request, or employee's setting, or fall back to global settings
            emp_work_hours = float(
                attendance.get('work_hours_per_day') or
                employee.work_hours_per_day or
                settings.work_hours_per_day or 8
            )

            if settings.use_ican_formula and monthly_basic > 0:
                daily_rate = calculate_ican_daily_rate(monthly_basic, int(settings.working_days_per_year or 261))
                minute_rate = calculate_ican_minute_rate(daily_rate, emp_work_hours)

                # Create new deductions dict to ensure SQLAlchemy detects changes
                deductions = dict(payslip.deductions or {})

                # Store rates used for display
                deductions['absences_daily_rate_used'] = daily_rate
                deductions['late_minute_rate_used'] = minute_rate
                deductions['work_hours_per_day_used'] = emp_work_hours

                # Recalculate absence deduction
                if payslip.days_absent and payslip.days_absent > 0:
                    payslip.absent_deduction = Decimal(str(round(daily_rate * payslip.days_absent, 2)))
                    deductions['absences_amount'] = float(payslip.absent_deduction)
                    deductions['absences_days'] = payslip.days_absent
                else:
                    payslip.absent_deduction = Decimal('0')
                    deductions['absences_amount'] = 0
                    deductions['absences_days'] = 0

                # Recalculate late deduction
                total_late_minutes = payslip.total_late_minutes or 0
                if total_late_minutes > 0:
                    payslip.late_deduction = Decimal(str(round(minute_rate * total_late_minutes, 2)))
                    deductions['late_amount'] = float(payslip.late_deduction)
                    deductions['late_minutes'] = total_late_minutes
                else:
                    payslip.late_deduction = Decimal('0')
                    deductions['late_amount'] = 0
                    deductions['late_minutes'] = 0

                # Assign deductions and flag as modified
                payslip.deductions = deductions
                flag_modified(payslip, 'deductions')

                # Recalculate total deductions
                amount_fields = ['absences_amount', 'late_amount', 'sss', 'philhealth', 'pagibig', 'tax', 'loans', 'undertime_amount']
                total = Decimal('0')
                for f in amount_fields:
                    v = deductions.get(f, 0)
                    if v is not None:
                        try:
                            total += Decimal(str(v))
                        except:
                            pass
                payslip.total_deductions = total
                payslip.net_pay = (payslip.total_earnings or Decimal('0')) - payslip.total_deductions

    # Auto-save settings as employee's defaults for future payrolls
    # This is the "preset" feature - when you edit an employee's settings,
    # it automatically becomes their default for all future payroll runs
    employee = db.query(Employee).filter(Employee.id == payslip.employee_id).first()
    preset_saved = False
    preset_fields = []

    if employee:
        if 'days_worked' in attendance:
            employee.default_days_per_cutoff = Decimal(str(attendance['days_worked']))
            preset_saved = True
            preset_fields.append(f"days per cutoff: {attendance['days_worked']}")

        if 'work_hours_per_day' in attendance:
            employee.work_hours_per_day = Decimal(str(attendance['work_hours_per_day']))
            preset_saved = True
            preset_fields.append(f"work hours: {attendance['work_hours_per_day']}")

        if 'call_time' in attendance:
            employee.call_time = attendance['call_time']
            preset_saved = True
            preset_fields.append(f"call time: {attendance['call_time']}")

        if 'time_out' in attendance:
            employee.time_out = attendance['time_out']
            preset_saved = True
            preset_fields.append(f"time out: {attendance['time_out']}")

        if 'buffer_minutes' in attendance:
            employee.buffer_minutes = int(attendance['buffer_minutes'])
            preset_saved = True
            preset_fields.append(f"buffer: {attendance['buffer_minutes']} mins")

        if 'is_flexible' in attendance:
            employee.is_flexible = bool(attendance['is_flexible'])
            preset_saved = True
            preset_fields.append(f"flexible: {'Yes' if attendance['is_flexible'] else 'No'}")

    db.commit()

    response = {
        "message": "Attendance updated",
        "days_worked": payslip.days_worked,
        "days_absent": payslip.days_absent,
        "late_count": payslip.late_count,
        "total_late_minutes": payslip.total_late_minutes,
        "overtime_hours": float(payslip.overtime_hours) if payslip.overtime_hours else 0,
        "total_deductions": float(payslip.total_deductions or 0),
        "net_pay": float(payslip.net_pay or 0)
    }

    if preset_saved:
        response["preset_saved"] = True
        response["preset_message"] = f"Defaults saved for future payrolls: {', '.join(preset_fields)}"

    return response


@router.delete("/payslips/{payslip_id}")
async def delete_payslip(
    payslip_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete payslip (Admin only). Can only delete if payroll run is not locked."""
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Check if locked
    run = db.query(PayrollRun).filter(PayrollRun.id == payslip.payroll_run_id).first()
    if run and run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot delete payslip from locked payroll run")

    db.delete(payslip)
    db.commit()

    return {"message": "Payslip deleted"}


# === Payroll Settings ===

@router.get("/settings", response_model=PayrollSettingsResponse)
async def get_payroll_settings(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get payroll settings (Admin only)."""
    settings = db.query(PayrollSettings).first()
    if not settings:
        # Create default settings if none exist
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
            work_days_per_month=22
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return PayrollSettingsResponse.model_validate(settings)


@router.patch("/settings", response_model=PayrollSettingsResponse)
async def update_payroll_settings(
    settings_data: PayrollSettingsUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update payroll settings (Admin only)."""
    settings = db.query(PayrollSettings).first()
    if not settings:
        # Create settings if they don't exist
        settings = PayrollSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)

    # Update only provided fields
    update_data = settings_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)
    settings.updated_by = current_admin.id

    db.commit()
    db.refresh(settings)
    return PayrollSettingsResponse.model_validate(settings)


@router.post("/settings/apply-to-all")
async def apply_settings_to_all_employees(
    confirmation_code: str = Query(..., description="Must be 'WeCanInICAN!' to confirm"),
    apply_basic_salary: bool = Query(False),
    apply_sss: bool = Query(False),
    apply_philhealth: bool = Query(False),
    apply_pagibig: bool = Query(False),
    apply_tax: bool = Query(False),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Apply payroll settings to ALL employees.
    Requires confirmation code 'WeCanInICAN!' to prevent accidental changes.
    """
    # Verify confirmation code
    if confirmation_code != "WeCanInICAN!":
        raise HTTPException(status_code=400, detail="Invalid confirmation code. Type 'WeCanInICAN!' to confirm.")

    # Get current settings
    settings = db.query(PayrollSettings).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Payroll settings not found")

    # Get all active employees
    employees = db.query(Employee).filter(Employee.is_active == True).all()

    updated_fields = []
    updated_count = 0

    for emp in employees:
        changed = False

        if apply_basic_salary and settings.default_basic_salary:
            emp.basic_salary = settings.default_basic_salary
            # Also calculate daily and hourly rates
            daily_rate = float(settings.default_basic_salary) * 12 / 261
            emp.daily_rate = daily_rate
            emp.hourly_rate = daily_rate / 8
            changed = True

        if apply_sss and settings.default_sss is not None:
            emp.sss_contribution = settings.default_sss
            changed = True

        if apply_philhealth and settings.default_philhealth is not None:
            emp.philhealth_contribution = settings.default_philhealth
            changed = True

        if apply_pagibig and settings.default_pagibig is not None:
            emp.pagibig_contribution = settings.default_pagibig
            changed = True

        if apply_tax and settings.default_tax is not None:
            emp.tax_amount = settings.default_tax
            changed = True

        if changed:
            updated_count += 1

    if apply_basic_salary:
        updated_fields.append(f"Basic Salary: ₱{float(settings.default_basic_salary or 0):,.2f}")
    if apply_sss:
        updated_fields.append(f"SSS: ₱{float(settings.default_sss or 0):,.2f}")
    if apply_philhealth:
        updated_fields.append(f"PhilHealth: ₱{float(settings.default_philhealth or 0):,.2f}")
    if apply_pagibig:
        updated_fields.append(f"Pag-IBIG: ₱{float(settings.default_pagibig or 0):,.2f}")
    if apply_tax:
        updated_fields.append(f"Tax: ₱{float(settings.default_tax or 0):,.2f}")

    db.commit()

    return {
        "success": True,
        "message": f"Updated {updated_count} employees",
        "updated_count": updated_count,
        "fields_applied": updated_fields
    }


# === 13th Month Pay ===

@router.get("/13th-month")
async def list_thirteenth_month(
    year: Optional[int] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List 13th month pay records (Admin only)."""
    query = db.query(ThirteenthMonthPay).join(Employee)

    if year:
        query = query.filter(ThirteenthMonthPay.year == year)

    records = query.order_by(ThirteenthMonthPay.year.desc(), Employee.last_name).all()

    items = []
    for r in records:
        items.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "employee_name": r.employee.full_name if r.employee else "Unknown",
            "employee_no": r.employee.employee_no if r.employee else "",
            "year": r.year,
            "total_basic_earned": float(r.total_basic_earned),
            "months_worked": r.months_worked,
            "amount": float(r.amount),
            "is_released": r.is_released,
            "released_at": r.released_at.isoformat() if r.released_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return {"items": items, "total": len(items)}


@router.post("/13th-month/calculate")
async def calculate_thirteenth_month(
    year: int = Query(..., ge=2020, le=2100),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Calculate 13th month pay for all active employees for a given year.

    Formula: Total Basic Salary Earned in Year / 12

    Philippine Labor Code requires 13th month pay for employees who worked at least 1 month.
    """
    # Get all active employees
    employees = db.query(Employee).filter(
        Employee.is_active == True,
        Employee.status == 'active'
    ).all()

    if not employees:
        raise HTTPException(status_code=400, detail="No active employees found")

    # Delete existing 13th month records for this year (to recalculate)
    db.query(ThirteenthMonthPay).filter(ThirteenthMonthPay.year == year).delete()

    results = []
    total_amount = Decimal('0')

    for employee in employees:
        # Get all payslips for this employee in the given year
        payslips = db.query(Payslip).join(PayrollRun).filter(
            Payslip.employee_id == employee.id,
            extract('year', PayrollRun.period_start) == year
        ).all()

        # Calculate total basic earned from payslips
        total_basic_earned = Decimal('0')
        months_with_pay = set()

        for payslip in payslips:
            earnings = payslip.earnings or {}
            # Sum basic earnings (basic_semi is semi-monthly)
            basic_semi = Decimal(str(earnings.get('basic_semi', 0)))
            total_basic_earned += basic_semi

            # Track months worked
            if payslip.payroll_run:
                months_with_pay.add(payslip.payroll_run.period_start.month)

        # If no payslips, use monthly basic salary * estimated months
        if not payslips and employee.basic_salary:
            # Check if employee was hired this year
            if employee.hire_date and employee.hire_date.year == year:
                months_worked = 12 - employee.hire_date.month + 1
            else:
                months_worked = 12
            total_basic_earned = Decimal(str(employee.basic_salary)) * months_worked
        else:
            months_worked = len(months_with_pay)

        # Only include if employee worked at least 1 month
        if months_worked < 1 and total_basic_earned <= 0:
            continue

        # Calculate 13th month pay: total basic / 12
        thirteenth_month_amount = (total_basic_earned / 12).quantize(Decimal('0.01'))

        # Create record
        record = ThirteenthMonthPay(
            employee_id=employee.id,
            year=year,
            total_basic_earned=total_basic_earned,
            months_worked=months_worked,
            amount=thirteenth_month_amount,
            is_released=False,
            created_by=current_admin.id
        )
        db.add(record)

        total_amount += thirteenth_month_amount
        results.append({
            "employee_id": employee.id,
            "employee_name": employee.full_name,
            "employee_no": employee.employee_no,
            "total_basic_earned": float(total_basic_earned),
            "months_worked": months_worked,
            "amount": float(thirteenth_month_amount)
        })

    db.commit()

    return {
        "message": f"13th month pay calculated for {len(results)} employees",
        "year": year,
        "employee_count": len(results),
        "total_amount": float(total_amount),
        "records": results
    }


@router.get("/13th-month/{record_id}")
async def get_thirteenth_month(
    record_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get 13th month pay record by ID."""
    record = db.query(ThirteenthMonthPay).filter(ThirteenthMonthPay.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="13th month record not found")

    # Non-admin can only see their own released records
    if current_user.role != Role.ADMIN:
        if current_user.employee_id != record.employee_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not record.is_released:
            raise HTTPException(status_code=404, detail="Record not found")

    return {
        "id": record.id,
        "employee_id": record.employee_id,
        "employee_name": record.employee.full_name if record.employee else "Unknown",
        "employee_no": record.employee.employee_no if record.employee else "",
        "year": record.year,
        "total_basic_earned": float(record.total_basic_earned),
        "months_worked": record.months_worked,
        "amount": float(record.amount),
        "is_released": record.is_released,
        "released_at": record.released_at.isoformat() if record.released_at else None,
        "created_at": record.created_at.isoformat() if record.created_at else None
    }


@router.patch("/13th-month/{record_id}")
async def update_thirteenth_month(
    record_id: int,
    amount: Optional[Decimal] = None,
    total_basic_earned: Optional[Decimal] = None,
    months_worked: Optional[int] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update 13th month pay record (Admin only). Can only update unreleased records."""
    record = db.query(ThirteenthMonthPay).filter(ThirteenthMonthPay.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="13th month record not found")

    if record.is_released:
        raise HTTPException(status_code=400, detail="Cannot update released 13th month record")

    if amount is not None:
        record.amount = amount
    if total_basic_earned is not None:
        record.total_basic_earned = total_basic_earned
    if months_worked is not None:
        record.months_worked = months_worked

    db.commit()
    db.refresh(record)

    return {
        "message": "13th month record updated",
        "id": record.id,
        "amount": float(record.amount)
    }


@router.delete("/13th-month/{record_id}")
async def delete_thirteenth_month(
    record_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete 13th month pay record (Admin only). Can only delete unreleased records."""
    record = db.query(ThirteenthMonthPay).filter(ThirteenthMonthPay.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="13th month record not found")

    if record.is_released:
        raise HTTPException(status_code=400, detail="Cannot delete released 13th month record")

    db.delete(record)
    db.commit()

    return {"message": "13th month record deleted"}


@router.post("/13th-month/release")
async def release_thirteenth_month(
    year: int = Query(..., ge=2020, le=2100),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Release 13th month pay for a given year (make visible to employees)."""
    records = db.query(ThirteenthMonthPay).filter(
        ThirteenthMonthPay.year == year,
        ThirteenthMonthPay.is_released == False
    ).all()

    if not records:
        raise HTTPException(status_code=400, detail="No unreleased 13th month records found for this year")

    for record in records:
        record.is_released = True
        record.released_at = datetime.utcnow()

    db.commit()

    return {"message": f"Released 13th month pay for {len(records)} employees"}


# === PDF Generation ===

def generate_payslip_pdf(payslip: Payslip, company_name: str = "Company") -> bytes:
    """Generate compact black & white PDF for a single payslip (3x3 inches)."""
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    # 3x3 inch page size
    page_width = 3 * inch
    page_height = 3 * inch

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=(page_width, page_height),
        topMargin=0.08*inch,
        bottomMargin=0.08*inch,
        leftMargin=0.1*inch,
        rightMargin=0.1*inch
    )
    styles = getSampleStyleSheet()
    elements = []

    # Compact styles - all black
    title_style = ParagraphStyle('Title', fontSize=7, fontName='Helvetica-Bold', alignment=1, spaceAfter=1)
    small_style = ParagraphStyle('Small', fontSize=5, alignment=1, spaceAfter=1)

    # Header
    elements.append(Paragraph(company_name.upper(), title_style))
    elements.append(Paragraph("PAYSLIP", small_style))

    # Period info
    period_start = payslip.payroll_run.period_start.strftime('%m/%d/%y') if payslip.payroll_run else 'N/A'
    period_end = payslip.payroll_run.period_end.strftime('%m/%d/%y') if payslip.payroll_run else 'N/A'
    cutoff_text = '1st' if (payslip.payroll_run and payslip.payroll_run.cutoff == 1) else '2nd'

    # Employee info - compact
    emp_name = payslip.employee.full_name if payslip.employee else 'Unknown'
    emp_no = payslip.employee.employee_no if payslip.employee else ''

    info_data = [
        [emp_name, emp_no],
        [f"{period_start} - {period_end}", f"{cutoff_text} Cutoff"],
    ]
    info_table = Table(info_data, colWidths=[1.5*inch, 1.2*inch])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 5),
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 0.03*inch))

    # Earnings and Deductions
    earnings = payslip.earnings or {}
    deductions = payslip.deductions or {}

    def fmt(amount):
        return f"{float(amount):,.2f}"

    # Build compact earnings/deductions
    rows = []
    rows.append(['EARNINGS', '', 'DEDUCTIONS', ''])

    earnings_items = [
        ('Basic', earnings.get('basic_semi', 0)),
        ('Allow', earnings.get('allowance_semi', 0)),
        ('Prod', earnings.get('productivity_incentive_semi', 0)),
        ('Lang', earnings.get('language_incentive_semi', 0)),
        ('RH', earnings.get('regular_holiday', 0)),
        ('SNWH', earnings.get('snwh', 0)),
        ('OT', earnings.get('overtime', 0)),
    ]

    deduction_items = [
        ('SSS', deductions.get('sss', 0)),
        ('PH', deductions.get('philhealth', 0)),
        ('HDMF', deductions.get('pagibig', 0)),
        ('Tax', deductions.get('tax', 0)),
        ('Loan', deductions.get('loans', 0)),
        ('Abs', earnings.get('absent_deduction', 0)),
        ('Late', earnings.get('late_deduction', 0)),
    ]

    # Filter non-zero items
    earnings_items = [(l, a) for l, a in earnings_items if a and float(a) > 0]
    deduction_items = [(l, a) for l, a in deduction_items if a and float(a) > 0]

    max_rows = max(len(earnings_items), len(deduction_items), 1)
    for i in range(max_rows):
        e_label = earnings_items[i][0] if i < len(earnings_items) else ''
        e_amt = fmt(earnings_items[i][1]) if i < len(earnings_items) else ''
        d_label = deduction_items[i][0] if i < len(deduction_items) else ''
        d_amt = fmt(deduction_items[i][1]) if i < len(deduction_items) else ''
        rows.append([e_label, e_amt, d_label, d_amt])

    # Totals row
    rows.append(['Total', fmt(payslip.total_earnings), 'Total', fmt(payslip.total_deductions)])

    main_table = Table(rows, colWidths=[0.45*inch, 0.75*inch, 0.45*inch, 0.75*inch])
    main_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 5),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
        ('LINEABOVE', (0, 0), (-1, 0), 0.5, colors.black),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.black),
        ('LINEABOVE', (0, -1), (-1, -1), 0.5, colors.black),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, colors.black),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
    ]))
    elements.append(main_table)
    elements.append(Spacer(1, 0.04*inch))

    # Net Pay - prominent but compact
    net_data = [['NET PAY:', fmt(payslip.net_pay)]]
    net_table = Table(net_data, colWidths=[1.2*inch, 1.4*inch])
    net_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(net_table)

    # Attendance summary - single line
    att_text = f"Days:{payslip.days_worked} Late:{payslip.late_count} OT:{payslip.overtime_hours}h"
    elements.append(Paragraph(att_text, ParagraphStyle('Att', fontSize=4, alignment=1, spaceBefore=2)))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/payslips/{payslip_id}/pdf")
async def download_payslip_pdf(
    payslip_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download payslip as PDF."""
    from app.models.settings import SystemSettings

    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Non-admin can only download their own
    if current_user.role != Role.ADMIN:
        if current_user.employee_id != payslip.employee_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not payslip.is_released:
            raise HTTPException(status_code=404, detail="Payslip not found")

    # Get company name from settings
    settings = db.query(SystemSettings).first()
    company_name = settings.company_name if settings else "Company"

    # Generate PDF
    pdf_bytes = generate_payslip_pdf(payslip, company_name)

    # Create coded filename
    filename = generate_coded_filename(payslip, "pdf")

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# === PNG Payslip Generation ===

def generate_payslip_png(payslip: Payslip, company_name: str = "I CAN LANGUAGE CENTER INC.") -> bytes:
    """
    Generate PNG payslip image matching I CAN LANGUAGE CENTER format.
    Size: 400x520 pixels (4x5.2 inches at 100 DPI) - fits 2x2 on letter paper.
    """
    from PIL import Image, ImageDraw, ImageFont

    width, height = 400, 520
    img = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(img)

    # Load fonts
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
        font_bold = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 11)
        font_normal = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 10)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 9)
    except:
        font_title = ImageFont.load_default()
        font_bold = font_title
        font_normal = font_title
        font_small = font_title

    y = 10
    margin = 12
    mid_x = width // 2

    # Get employee and payroll data
    employee = payslip.employee
    emp_name = f"{employee.last_name}, {employee.first_name}" if employee else 'Unknown'
    if employee and employee.middle_name:
        emp_name += f", {employee.middle_name}"
    job_title = employee.position if employee else ''
    emp_type = employee.employment_type.replace('_', ' ').title() if employee and employee.employment_type else 'Regular'

    payroll_run = payslip.payroll_run
    period_start = payroll_run.period_start if payroll_run else None
    period_end = payroll_run.period_end if payroll_run else None
    cutoff = payroll_run.cutoff if payroll_run else 1

    # Format period
    if period_start and period_end:
        period_str = f"{period_start.strftime('%b %d')} - {period_end.strftime('%b %d, %Y')}"
    else:
        period_str = 'N/A'

    earnings = payslip.earnings or {}
    deductions = payslip.deductions or {}

    def fmt(amount):
        """Format currency."""
        try:
            val = float(amount or 0)
            if val == 0:
                return '-'
            return f"{val:,.2f}"
        except:
            return '-'

    # === HEADER ===
    draw.text((mid_x, y), company_name, fill='black', font=font_title, anchor='mt')
    y += 20
    draw.text((mid_x, y), "Pay Slip", fill='black', font=font_bold, anchor='mt')

    # Date and Period (right side)
    draw.text((width - margin, y - 12), f"Date: {datetime.now().strftime('%Y-%m-%d')}", fill='black', font=font_small, anchor='rt')
    draw.text((width - margin, y + 2), f"Period: {period_str}", fill='black', font=font_small, anchor='rt')
    y += 22

    # Divider
    draw.line([(margin, y), (width - margin, y)], fill='black', width=1)
    y += 8

    # === EMPLOYEE INFO ===
    col1, col2 = margin, mid_x + 10
    draw.text((col1, y), "Name:", fill='black', font=font_small)
    draw.text((col1 + 40, y), emp_name, fill='black', font=font_bold)
    draw.text((col2, y), "Job Title:", fill='black', font=font_small)
    draw.text((col2 + 55, y), job_title or '-', fill='black', font=font_normal)
    y += 14

    draw.text((col1, y), "Type:", fill='black', font=font_small)
    draw.text((col1 + 40, y), f"{emp_type} - Full Time", fill='black', font=font_normal)
    draw.text((col2, y), "Start Date:", fill='black', font=font_small)
    start_date = employee.hire_date if employee and employee.hire_date else '-'
    draw.text((col2 + 55, y), str(start_date), fill='black', font=font_normal)
    y += 14

    draw.text((col1, y), "Hours:", fill='black', font=font_small)
    draw.text((col1 + 40, y), "8hrs", fill='black', font=font_normal)
    draw.text((col1 + 80, y), "Schedule:", fill='black', font=font_small)
    draw.text((col1 + 130, y), "10am - 7pm", fill='black', font=font_normal)
    y += 18

    # Divider
    draw.line([(margin, y), (width - margin, y)], fill='black', width=1)
    y += 8

    # === SALARY SECTION HEADERS ===
    left_col = margin
    left_val = margin + 110
    right_col = mid_x + 5
    right_val = width - margin - 10

    draw.text((left_col, y), "Monthly Rate", fill='black', font=font_bold)
    draw.text((right_col, y), "Semi - Monthly", fill='black', font=font_bold)
    y += 16

    # Get monthly values from employee
    basic_monthly = float(employee.basic_salary or 0) if employee else 0
    allowance_monthly = float(employee.allowance or 0) if employee else 0
    prod_monthly = float(employee.productivity_incentive or 0) if employee else 0
    lang_monthly = float(employee.language_incentive or 0) if employee else 0
    daily_rate = float(employee.daily_rate or 0) if employee else 0
    hourly_rate = float(employee.hourly_rate or 0) if employee else 0

    # Get semi-monthly values from payslip
    basic_semi = float(earnings.get('basic_semi', 0))
    allowance_semi = float(earnings.get('allowance_semi', 0))
    prod_semi = float(earnings.get('productivity_incentive_semi', 0))
    lang_semi = float(earnings.get('language_incentive_semi', 0))
    reg_ot = float(earnings.get('overtime', 0))
    holiday = float(earnings.get('regular_holiday', 0))

    # === EARNINGS ROWS ===
    row_height = 14

    # Row 1: Basic Salary / Basic (semi mo)
    draw.text((left_col, y), "Basic Salary", fill='black', font=font_small)
    draw.text((left_val, y), fmt(basic_monthly), fill='black', font=font_normal, anchor='rt')
    draw.text((right_col, y), "Basic (semi mo)", fill='black', font=font_small)
    draw.text((right_val, y), fmt(basic_semi), fill='black', font=font_normal, anchor='rt')
    y += row_height

    # Row 2: Allowance / Prod Incentive
    draw.text((left_col, y), "Allowance", fill='black', font=font_small)
    draw.text((left_val, y), fmt(allowance_monthly), fill='black', font=font_normal, anchor='rt')
    draw.text((right_col, y), "Prod Incentive", fill='black', font=font_small)
    draw.text((right_val, y), fmt(prod_semi), fill='black', font=font_normal, anchor='rt')
    y += row_height

    # Row 3: Prod Incentive / Lang Incentive
    draw.text((left_col, y), "Prod Incentive", fill='black', font=font_small)
    draw.text((left_val, y), fmt(prod_monthly), fill='black', font=font_normal, anchor='rt')
    draw.text((right_col, y), "Lang Incentive", fill='black', font=font_small)
    draw.text((right_val, y), fmt(lang_semi), fill='black', font=font_normal, anchor='rt')
    y += row_height

    # Row 4: Lang Incentive / Allowance
    draw.text((left_col, y), "Lang Incentive", fill='black', font=font_small)
    draw.text((left_val, y), fmt(lang_monthly), fill='black', font=font_normal, anchor='rt')
    draw.text((right_col, y), "Allowance", fill='black', font=font_small)
    draw.text((right_val, y), fmt(allowance_semi), fill='black', font=font_normal, anchor='rt')
    y += row_height + 6

    # Row 5: Daily Rate / Reg. OT
    draw.text((left_col, y), "Total Daily Rate", fill='black', font=font_small)
    draw.text((left_val, y), fmt(daily_rate), fill='black', font=font_normal, anchor='rt')
    draw.text((right_col, y), "Reg. OT", fill='black', font=font_small)
    draw.text((right_val, y), fmt(reg_ot), fill='black', font=font_normal, anchor='rt')
    y += row_height

    # Row 6: Hourly Rate / Holiday
    draw.text((left_col, y), "Hourly Rate", fill='black', font=font_small)
    draw.text((left_val, y), fmt(hourly_rate), fill='black', font=font_normal, anchor='rt')
    draw.text((right_col, y), "Holiday", fill='black', font=font_small)
    draw.text((right_val, y), fmt(holiday), fill='black', font=font_normal, anchor='rt')
    y += row_height + 8

    # === ABSENCES/LATES ===
    absent_amt = float(earnings.get('absent_deduction', 0) or deductions.get('absences_amount', 0) or 0)
    late_amt = float(earnings.get('late_deduction', 0) or deductions.get('late_amount', 0) or 0)
    absences_total = absent_amt + late_amt

    draw.text((left_col, y), "Abs / Late", fill='black', font=font_small)
    draw.text((left_val, y), fmt(absences_total), fill='black', font=font_normal, anchor='rt')
    y += row_height + 8

    # Divider
    draw.line([(margin, y), (width - margin, y)], fill='black', width=1)
    y += 8

    # === DEDUCTIONS ===
    sss = float(deductions.get('sss', 0))
    philhealth = float(deductions.get('philhealth', 0))
    hdmf = float(deductions.get('pagibig', 0))
    wtax = float(deductions.get('tax', 0))

    draw.text((right_col, y), "SSS", fill='black', font=font_small)
    draw.text((right_val, y), fmt(sss), fill='black', font=font_normal, anchor='rt')
    y += row_height

    draw.text((right_col, y), "PHIL", fill='black', font=font_small)
    draw.text((right_val, y), fmt(philhealth), fill='black', font=font_normal, anchor='rt')
    y += row_height

    draw.text((right_col, y), "HDMF", fill='black', font=font_small)
    draw.text((right_val, y), fmt(hdmf), fill='black', font=font_normal, anchor='rt')
    y += row_height

    draw.text((right_col, y), "Wtax", fill='black', font=font_small)
    draw.text((right_val, y), fmt(wtax), fill='black', font=font_normal, anchor='rt')
    y += row_height + 8

    # === NET PAY ===
    draw.rectangle([(right_col - 5, y - 2), (right_val + 5, y + 18)], outline='black', width=2)
    draw.text((right_col, y + 2), "Net Pay", fill='black', font=font_bold)
    draw.text((right_val, y + 2), fmt(payslip.net_pay), fill='black', font=font_bold, anchor='rt')
    y += 30

    # Divider
    draw.line([(margin, y), (width - margin, y)], fill='black', width=1)
    y += 10

    # === SIGNATURES ===
    sig_col1 = margin
    sig_col2 = mid_x + 20

    draw.text((sig_col1, y), "Prepared by:", fill='black', font=font_small)
    draw.text((sig_col2, y), "Approved by:", fill='black', font=font_small)
    y += 25

    draw.line([(sig_col1, y), (sig_col1 + 100, y)], fill='black', width=1)
    draw.line([(sig_col2, y), (sig_col2 + 100, y)], fill='black', width=1)
    y += 18

    draw.text((sig_col1, y), "Received by:", fill='black', font=font_small)
    y += 25

    draw.line([(sig_col1, y), (sig_col1 + 100, y)], fill='black', width=1)
    draw.text((sig_col1, y + 3), emp_name, fill='black', font=font_small)

    # Border
    draw.rectangle([(0, 0), (width - 1, height - 1)], outline='black', width=1)

    # Save to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer.getvalue()


def generate_payslips_sheet(payslips: list, company_name: str = "I CAN LANGUAGE CENTER INC.") -> bytes:
    """Generate a single PNG image with up to 4 payslips arranged in 2x2 grid."""
    from PIL import Image

    # Each payslip is 400x520 pixels (I CAN format)
    slip_w, slip_h = 400, 520
    # 2 columns, 2 rows = 800x1040 pixels (fits on letter paper)
    cols, rows = 2, 2
    sheet_w = slip_w * cols
    sheet_h = slip_h * rows

    sheet = Image.new('RGB', (sheet_w, sheet_h), 'white')

    for idx, payslip in enumerate(payslips[:4]):  # Max 4 per sheet (2x2)
        col = idx % cols
        row = idx // cols
        x = col * slip_w
        y = row * slip_h

        # Generate individual payslip PNG
        slip_bytes = generate_payslip_png(payslip, company_name)
        slip_img = Image.open(io.BytesIO(slip_bytes))
        sheet.paste(slip_img, (x, y))

    buffer = io.BytesIO()
    sheet.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/payslips/{payslip_id}/png")
async def download_payslip_png(
    payslip_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download single payslip as PNG image (3x3 inches)."""
    from app.models.settings import SystemSettings

    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    if current_user.role != Role.ADMIN:
        if current_user.employee_id != payslip.employee_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not payslip.is_released:
            raise HTTPException(status_code=404, detail="Payslip not found")

    settings = db.query(SystemSettings).first()
    company_name = settings.company_name if settings else "Company"

    png_bytes = generate_payslip_png(payslip, company_name)

    # Create coded filename
    filename = generate_coded_filename(payslip, "png")

    return StreamingResponse(
        io.BytesIO(png_bytes),
        media_type="image/png",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/runs/{run_id}/payslips-sheet")
async def download_payslips_sheet(
    run_id: int,
    page: int = Query(1, ge=1),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Download payslips as PNG sheet (4 per page in 2x2 grid, I CAN format).

    Use page=1 for first 4 employees, page=2 for next 4, etc.
    """
    from app.models.settings import SystemSettings

    payroll_run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not payroll_run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    # Get payslips for this run, paginated by 4 (2x2 grid)
    offset = (page - 1) * 4
    payslips = db.query(Payslip).filter(
        Payslip.payroll_run_id == run_id
    ).order_by(Payslip.id).offset(offset).limit(4).all()

    if not payslips:
        raise HTTPException(status_code=404, detail="No payslips found for this page")

    settings = db.query(SystemSettings).first()
    company_name = settings.company_name if settings else "Company"

    png_bytes = generate_payslips_sheet(payslips, company_name)

    # Create coded filename
    filename = generate_coded_sheet_filename(payroll_run, page)

    return StreamingResponse(
        io.BytesIO(png_bytes),
        media_type="image/png",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/runs/{run_id}/payslips-count")
async def get_payslips_count(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get count of payslips and number of pages (4 per page in 2x2 grid)."""
    count = db.query(Payslip).filter(Payslip.payroll_run_id == run_id).count()
    pages = (count + 3) // 4  # Ceiling division, 4 payslips per sheet

    return {"count": count, "pages": pages}


# === Payroll Import from File ===

@router.get("/import/template")
async def download_payroll_template(
    current_admin: User = Depends(get_current_admin)
):
    """Download Excel template for payroll import."""
    from app.services.payroll_import import generate_payroll_template

    template_bytes = generate_payroll_template()

    return StreamingResponse(
        io.BytesIO(template_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=payroll_template.xlsx"}
    )


@router.post("/import")
async def import_payroll_from_file(
    file: UploadFile = File(...),
    period_start: Optional[date] = Form(None),
    period_end: Optional[date] = Form(None),
    cutoff: Optional[int] = Form(None),
    auto_create_employees: bool = Form(True),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Import payroll data from Excel file and create payslips.

    Supports two formats:
    1. I CAN LANGUAGE CENTER payslip format - auto-detects period from file
    2. Tabular format with column headers

    If period_start/period_end not provided, auto-detects from file.
    If auto_create_employees=True, creates employees that don't exist.

    The system automatically:
    - Reads all values (basic salary, allowances, SSS, PhilHealth, etc.)
    - Creates payslips with the exact values from the file
    - Updates employee rates if they're missing
    - Creates new employees if not found (optional)

    Admin just needs to review for accuracy - no manual computation needed!
    """
    from app.services.payroll_import import import_payroll_from_file as do_import

    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ['.xls', '.xlsx']:
        raise HTTPException(status_code=400, detail="File must be .xls or .xlsx")

    # Validate dates if both provided
    if period_start and period_end and period_start > period_end:
        raise HTTPException(status_code=400, detail="Period start must be before period end")

    # Save uploaded file temporarily
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Process the file
        result = do_import(
            db=db,
            file_path=tmp_path,
            period_start=period_start,
            period_end=period_end,
            cutoff=cutoff,
            created_by=current_admin.id,
            auto_create_employees=auto_create_employees
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

    finally:
        # Clean up temp file
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.post("/import/preview")
async def preview_payroll_import(
    file: UploadFile = File(...),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Preview payroll import without creating payslips.
    Returns parsed data and shows which employees will be matched.
    """
    from app.services.payroll_import import parse_payroll_excel

    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ['.xls', '.xlsx']:
        raise HTTPException(status_code=400, detail="File must be .xls or .xlsx")

    # Save uploaded file temporarily
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Parse the file
        records, warnings = parse_payroll_excel(tmp_path)

        if not records:
            return {
                'success': False,
                'message': 'No valid records found',
                'warnings': warnings,
                'records': []
            }

        # Check which employees exist
        preview_records = []
        matched = 0
        not_matched = 0

        for record in records:
            employee = None
            employee_no = record.get('employee_no', '')

            if employee_no:
                employee = db.query(Employee).filter(
                    Employee.employee_no == employee_no
                ).first()

            if not employee and record.get('employee_name'):
                name = record['employee_name']
                employee = db.query(Employee).filter(
                    (Employee.first_name + ' ' + Employee.last_name == name) |
                    (Employee.last_name + ', ' + Employee.first_name == name)
                ).first()

            if employee:
                matched += 1
                preview_records.append({
                    **record,
                    'matched': True,
                    'matched_employee_id': employee.id,
                    'matched_employee_name': employee.full_name
                })
            else:
                not_matched += 1
                preview_records.append({
                    **record,
                    'matched': False,
                    'matched_employee_id': None,
                    'matched_employee_name': None
                })

        return {
            'success': True,
            'message': f'Found {len(records)} records: {matched} matched, {not_matched} not matched',
            'total_records': len(records),
            'matched': matched,
            'not_matched': not_matched,
            'warnings': warnings,
            'records': preview_records[:50]  # Limit preview to 50 records
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")

    finally:
        # Clean up temp file
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.get("/13th-month/{record_id}/pdf")
async def download_thirteenth_month_pdf(
    record_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download 13th month pay slip as PDF."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from app.models.settings import SystemSettings

    record = db.query(ThirteenthMonthPay).filter(ThirteenthMonthPay.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="13th month record not found")

    # Non-admin can only download their own
    if current_user.role != Role.ADMIN:
        if current_user.employee_id != record.employee_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not record.is_released:
            raise HTTPException(status_code=404, detail="Record not found")

    # Get company name
    settings = db.query(SystemSettings).first()
    company_name = settings.company_name if settings else "Company"

    # Generate PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch)
    styles = getSampleStyleSheet()
    elements = []

    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, alignment=1, spaceAfter=6)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=12, alignment=1, spaceAfter=20)

    elements.append(Paragraph(company_name, title_style))
    elements.append(Paragraph("13TH MONTH PAY", subtitle_style))
    elements.append(Spacer(1, 0.3*inch))

    def format_php(amount):
        return f"₱{float(amount):,.2f}"

    data = [
        ['Employee Name:', record.employee.full_name if record.employee else 'Unknown'],
        ['Employee No:', record.employee.employee_no if record.employee else ''],
        ['Year:', str(record.year)],
        ['', ''],
        ['Total Basic Earned:', format_php(record.total_basic_earned)],
        ['Months Worked:', str(record.months_worked)],
        ['', ''],
        ['13th Month Pay:', format_php(record.amount)],
    ]

    table = Table(data, colWidths=[2.5*inch, 3*inch])
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#4CAF50')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 0.5*inch))

    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=colors.grey, alignment=1)
    elements.append(Paragraph(f"Generated on {datetime.now().strftime('%B %d, %Y')}", footer_style))

    doc.build(elements)
    buffer.seek(0)

    # Create coded filename for 13th month
    if record.employee:
        names = record.employee.full_name.split()
        initials = ''.join(n[0].upper() for n in names if n)[:3]
        emp_no = record.employee.employee_no or "00"
        emp_short = ''.join(filter(str.isdigit, emp_no))[-2:] or "00"
    else:
        initials = "XX"
        emp_short = "00"
    year_short = str(record.year)[-2:]
    filename = f"BONUS-{initials}{emp_short}-{year_short}.pdf"

    return StreamingResponse(
        io.BytesIO(buffer.getvalue()),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
