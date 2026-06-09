"""
Payroll API Endpoints
=====================
Payroll runs, payslips, 13th month pay, PDF generation, and deduction configuration.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import extract
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
import io
import os
import tempfile

from app.api.deps import get_db, get_current_admin, get_current_user
from app.models.user import User, Role
from app.models.payroll import PayrollRun, Payslip, DeductionConfig, PayrollStatus, PayrollSettings, ThirteenthMonthPay, ContributionTable, ContributionType
from app.models.employee import Employee
from app.models.audit import AuditLog, AuditAction
from app.models.settings import SystemSettings
from app.schemas.payroll import (
    PayrollRunCreate, PayrollRunResponse, PayrollRunListResponse,
    PayslipAdjustRequest,
    DeductionConfigCreate, DeductionConfigUpdate, DeductionConfigResponse,
    PayrollSettingsUpdate, PayrollSettingsResponse,
    ContributionTableCreate, ContributionTableUpdate, ContributionTableResponse, ContributionTableListResponse
)
from app.services.email_service import email_service
from app.services.audit_service import AuditService
from app.services.payroll_calculator import get_payroll_settings as _get_payroll_settings, calculate_ican_daily_rate, calculate_ican_minute_rate
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _snapshot_payslip(payslip: Payslip) -> dict:
    """Capture full payslip state for audit trail / restore."""
    return {
        "earnings": payslip.earnings,
        "deductions": payslip.deductions,
        "total_earnings": float(payslip.total_earnings or 0),
        "total_deductions": float(payslip.total_deductions or 0),
        "net_pay": float(payslip.net_pay or 0),
        "days_worked": float(payslip.days_worked or 0),
        "days_absent": float(payslip.days_absent or 0),
        "late_count": payslip.late_count or 0,
        "total_late_minutes": payslip.total_late_minutes or 0,
        "overtime_hours": float(payslip.overtime_hours or 0),
        "additional_amount": float(payslip.additional_amount or 0),
        "additional_notes": payslip.additional_notes,
        "employee_name": payslip.employee.full_name if payslip.employee else "Unknown",
    }


def _audit_payslip_edit(db: Session, payslip: Payslip, old_snap: dict, new_snap: dict,
                        user: User, change_type: str, ip: str = None):
    """Log a payslip edit to the audit trail."""
    audit = AuditLog(
        user_id=user.id,
        user_email=user.email,
        action=AuditAction.PAYSLIP_EDIT,
        resource_type="payslip",
        resource_id=str(payslip.id),
        old_value=old_snap,
        new_value=new_snap,
        reason=change_type,
        ip_address=ip,
        extra_data={
            "employee_id": payslip.employee_id,
            "employee_name": new_snap.get("employee_name", ""),
            "payroll_run_id": payslip.payroll_run_id,
            "change_type": change_type,
        }
    )
    db.add(audit)


# ---- Shared Constants & Helpers ----

EARNINGS_FIELDS = [
    'basic_semi', 'allowance_semi', 'productivity_incentive_semi', 'language_incentive_semi',
    'regular_holiday', 'regular_holiday_ot', 'snwh', 'snwh_ot', 'overtime',
]

def get_cutoff_deduction_fields(cutoff: int) -> list:
    """Return the deduction fields applicable to this cutoff."""
    if cutoff == 1:
        return ['absences_amount', 'late_amount', 'undertime_amount', 'tax', 'sss_loan', 'pagibig_loan', 'other_loan']
    else:
        return ['absences_amount', 'late_amount', 'undertime_amount', 'tax', 'sss', 'philhealth', 'pagibig']

def migrate_overtime_key(earnings: dict) -> None:
    """Standardize old 'overtime_pay' key to 'overtime' in-place."""
    if 'overtime_pay' in earnings and 'overtime' not in earnings:
        earnings['overtime'] = earnings.pop('overtime_pay')
    elif 'overtime_pay' in earnings:
        earnings.pop('overtime_pay')

def sum_earnings(earnings: dict) -> Decimal:
    """Sum only the actual earnings fields from the earnings JSON."""
    prorate_total = sum_prorate_earnings(earnings)
    if prorate_total is not None:
        return prorate_total

    total = Decimal('0')
    for f in EARNINGS_FIELDS:
        v = earnings.get(f)
        if v is not None:
            try:
                total += Decimal(str(v))
            except:
                pass
    return total

def sum_deductions(deductions: dict, cutoff: int) -> Decimal:
    """Sum the applicable deduction fields for the given cutoff."""
    total = Decimal('0')
    for f in get_cutoff_deduction_fields(cutoff):
        v = deductions.get(f, 0)
        if v is not None:
            try:
                total += Decimal(str(v))
            except:
                pass
    return total


def sanitize_deductions_for_cutoff(deductions: Optional[dict], cutoff: int) -> dict:
    """Remove deduction values that do not apply to the current cutoff."""
    sanitized = dict(deductions or {})
    if cutoff == 1:
        sanitized['sss'] = 0
        sanitized['philhealth'] = 0
        sanitized['pagibig'] = 0
    else:
        sanitized['sss_loan'] = 0
        sanitized['pagibig_loan'] = 0
        sanitized['other_loan'] = 0
        sanitized['loans'] = 0
        sanitized['loans_breakdown'] = []
    return sanitized


def _to_decimal(value) -> Decimal:
    if value is None or value == "":
        return Decimal('0')
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal('0')


def _get_prorate_info(earnings: dict) -> Optional[list]:
    prorate_info = earnings.get('_prorate_info') if earnings else None
    if isinstance(prorate_info, list) and len(prorate_info) > 0:
        return prorate_info
    return None


def sum_prorate_earnings(earnings: dict) -> Optional[Decimal]:
    prorate_info = _get_prorate_info(earnings)
    if not prorate_info:
        return None

    total = Decimal('0')
    for period in prorate_info:
        if not isinstance(period, dict):
            continue
        if 'totalEarnings' in period:
            total += _to_decimal(period.get('totalEarnings'))
            continue
        total += _to_decimal(period.get('basicEarned'))
        total += _to_decimal(period.get('allowanceEarned'))
        total += _to_decimal(period.get('productivityEarned'))
        total += _to_decimal(period.get('languageEarned'))
        total += _to_decimal(period.get('otPay'))
        total += _to_decimal(period.get('regularHoliday'))
        total += _to_decimal(period.get('regularHolidayOt'))
        total += _to_decimal(period.get('snwh'))
        total += _to_decimal(period.get('snwhOt'))
    return total


def sum_prorate_attendance_deductions(earnings: dict) -> Optional[dict]:
    prorate_info = _get_prorate_info(earnings)
    if not prorate_info:
        return None

    absent = Decimal('0')
    late = Decimal('0')
    days_absent = Decimal('0')
    late_minutes = Decimal('0')

    for period in prorate_info:
        if not isinstance(period, dict):
            continue
        absent += _to_decimal(period.get('absentDeduction'))
        late += _to_decimal(period.get('lateDeduction'))
        days_absent += _to_decimal(period.get('daysAbsent'))
        late_minutes += _to_decimal(period.get('lateMinutes'))

    return {
        "absences_amount": absent,
        "late_amount": late,
        "days_absent": days_absent,
        "late_minutes": late_minutes,
    }


def sum_current_earnings(earnings: dict) -> Decimal:
    """Sum saved earnings without rewriting the earnings JSON."""
    prorate_total = sum_prorate_earnings(earnings)
    if prorate_total is not None:
        return prorate_total

    total = Decimal('0')
    for f in EARNINGS_FIELDS:
        total += _to_decimal(earnings.get(f))
    if 'overtime' not in earnings:
        total += _to_decimal(earnings.get('overtime_pay'))
    return total


def sum_saved_deductions(deductions: dict, cutoff: int, earnings: Optional[dict] = None) -> Decimal:
    deductions = sanitize_deductions_for_cutoff(deductions, cutoff)
    prorate_deductions = sum_prorate_attendance_deductions(earnings or {})
    total = Decimal('0')

    for field in get_cutoff_deduction_fields(cutoff):
        if prorate_deductions and field in ('absences_amount', 'late_amount'):
            total += prorate_deductions[field]
        else:
            total += _to_decimal(deductions.get(field))
    return total


def recalculate_payslip_totals_from_saved_values(payslip: Payslip, cutoff: int) -> dict:
    """Recompute only totals from existing payslip values."""
    earnings = dict(payslip.earnings or {})
    deductions = sanitize_deductions_for_cutoff(payslip.deductions, cutoff)

    total_earnings = sum_current_earnings(earnings)
    total_deductions = sum_saved_deductions(deductions, cutoff, earnings)
    net_pay = total_earnings - total_deductions

    payslip.deductions = deductions
    flag_modified(payslip, 'deductions')
    payslip.total_earnings = total_earnings
    payslip.total_deductions = total_deductions
    payslip.net_pay = net_pay

    return {
        "total_earnings": float(total_earnings),
        "total_deductions": float(total_deductions),
        "net_pay": float(net_pay),
    }


def get_payslip_totals_for_response(payslip: Payslip) -> dict:
    """Return display totals using only deductions allowed for the run cutoff."""
    earnings = dict(payslip.earnings or {})
    cutoff = payslip.payroll_run.cutoff if payslip.payroll_run else 1
    total_earnings = sum_current_earnings(earnings)
    total_deductions = sum_saved_deductions(payslip.deductions or {}, cutoff, earnings)
    return {
        "total_earnings": total_earnings,
        "total_deductions": total_deductions,
        "net_pay": total_earnings - total_deductions,
    }


def get_payslip_deductions_for_response(payslip: Payslip) -> dict:
    cutoff = payslip.payroll_run.cutoff if payslip.payroll_run else 1
    return sanitize_deductions_for_cutoff(payslip.deductions, cutoff)


def sync_payroll_run_totals(db: Session, payroll_run: PayrollRun) -> dict:
    """Update a payroll run summary from current payslip rows."""
    db.flush()
    payslips = db.query(Payslip).filter(Payslip.payroll_run_id == payroll_run.id).all()

    totals = [get_payslip_totals_for_response(p) for p in payslips]
    total_gross = sum((t["total_earnings"] for t in totals), Decimal('0'))
    total_deductions = sum((t["total_deductions"] for t in totals), Decimal('0'))
    total_net = sum((t["net_pay"] for t in totals), Decimal('0'))

    payroll_run.total_gross = total_gross
    payroll_run.total_deductions = total_deductions
    payroll_run.total_net = total_net
    payroll_run.employee_count = len(payslips)

    return {
        "employee_count": len(payslips),
        "total_gross": float(total_gross),
        "total_deductions": float(total_deductions),
        "total_net": float(total_net),
    }

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
    # Check for overlapping period (exclude soft-deleted runs)
    existing = db.query(PayrollRun).filter(
        PayrollRun.period_start <= run_data.period_end,
        PayrollRun.period_end >= run_data.period_start,
        PayrollRun.is_deleted == False
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
            user = db.query(User).filter(User.id == run.deleted_by).first()
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
        audit = AuditService(db)
        audit.log(
            action=AuditAction.PAYROLL_RUN,
            resource_type="payroll_run",
            user_id=current_admin.id,
            user_email=current_admin.email,
            resource_id=str(run_id),
            reason=reason,
            extra_data={"action": "FORCE_EDIT", "original_status": str(run.status)}
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
    audit = AuditService(db)
    audit.log(
        action=AuditAction.PAYROLL_RUN,
        resource_type="payroll_run",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(run_id),
        reason=reason,
        extra_data={
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
    audit = AuditService(db)
    audit.log(
        action=AuditAction.PAYROLL_RUN,
        resource_type="payroll_run",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(run_id),
        reason=f"Restored from trash. Original deletion reason: {run.deletion_reason[:200] if run.deletion_reason else 'N/A'}...",
        extra_data={"action": "RESTORE", "original_deleted_at": run.deleted_at.isoformat() if run.deleted_at else None}
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
    audit = AuditService(db)
    audit.log(
        action=AuditAction.PAYROLL_RUN,
        resource_type="payroll_run",
        user_id=current_admin.id,
        user_email=current_admin.email,
        resource_id=str(run_id),
        reason=f"Permanently deleted. Original deletion reason: {run.deletion_reason[:500] if run.deletion_reason else 'N/A'}",
        extra_data={
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
    Recalculate payroll run totals from current payslip rows.
    This does not overwrite individual payslip earnings, deductions, or attendance edits.
    """

    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    if run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot recalculate locked payroll")

    # Get all payslips for this run
    payslips = db.query(Payslip).filter(Payslip.payroll_run_id == run_id).all()
    if not payslips:
        raise HTTPException(status_code=400, detail="No payslips found in this payroll run")

    totals = sync_payroll_run_totals(db, run)

    db.commit()

    return {
        "message": f"Recalculated totals from {totals['employee_count']} payslips",
        "updated_count": totals["employee_count"],
        "total_gross": totals["total_gross"],
        "total_deductions": totals["total_deductions"],
        "total_net": totals["total_net"]
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

    summary = None
    if payroll_run_id:
        summary_payslips = query.all()
        summary_totals = [get_payslip_totals_for_response(p) for p in summary_payslips]
        summary = {
            "employee_count": len(summary_payslips),
            "total_gross": float(sum((t["total_earnings"] for t in summary_totals), Decimal('0'))),
            "total_deductions": float(sum((t["total_deductions"] for t in summary_totals), Decimal('0'))),
            "total_net": float(sum((t["net_pay"] for t in summary_totals), Decimal('0'))),
        }

    total = query.count()
    payslips = query.order_by(Payslip.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    items = []
    for p in payslips:
        # Get employee schedule info for display
        emp = p.employee
        is_flexible = emp.is_flexible if emp else False
        call_time = emp.call_time if emp else "08:00"
        time_out = emp.time_out if emp else "17:00"
        totals = get_payslip_totals_for_response(p)

        items.append({
            "id": p.id,
            "payroll_run_id": p.payroll_run_id,
            "employee_id": p.employee_id,
            "employee_name": p.employee.full_name if p.employee else "Unknown",
            "employee_no": p.employee.employee_no if p.employee else "",
            "period_start": p.payroll_run.period_start.isoformat() if p.payroll_run else None,
            "period_end": p.payroll_run.period_end.isoformat() if p.payroll_run else None,
            "earnings": p.earnings,
            "deductions": get_payslip_deductions_for_response(p),
            "total_earnings": float(totals["total_earnings"]),
            "total_deductions": float(totals["total_deductions"]),
            "net_pay": float(totals["net_pay"]),
            "days_worked": float(p.days_worked),
            "days_absent": float(p.days_absent),
            "late_count": p.late_count,
            "total_late_minutes": p.total_late_minutes,
            "overtime_hours": float(p.overtime_hours),
            "additional_amount": float(p.additional_amount or 0),
            "additional_notes": p.additional_notes,
            "is_released": p.is_released,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "is_flexible": is_flexible or False,
            "call_time": call_time or "08:00",
            "time_out": time_out or "17:00"
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": summary
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
            "employment_type": emp.employment_type or "",
            "allowance": float(emp.allowance or 0),
            "productivity_incentive": float(emp.productivity_incentive or 0),
            "language_incentive": float(emp.language_incentive or 0),
            "work_monday": getattr(emp, 'work_monday', True) if getattr(emp, 'work_monday', None) is not None else True,
            "work_tuesday": getattr(emp, 'work_tuesday', True) if getattr(emp, 'work_tuesday', None) is not None else True,
            "work_wednesday": getattr(emp, 'work_wednesday', True) if getattr(emp, 'work_wednesday', None) is not None else True,
            "work_thursday": getattr(emp, 'work_thursday', True) if getattr(emp, 'work_thursday', None) is not None else True,
            "work_friday": getattr(emp, 'work_friday', True) if getattr(emp, 'work_friday', None) is not None else True,
            "work_saturday": getattr(emp, 'work_saturday', False) if getattr(emp, 'work_saturday', None) is not None else False,
            "work_sunday": getattr(emp, 'work_sunday', False) if getattr(emp, 'work_sunday', None) is not None else False,
        }

    totals = get_payslip_totals_for_response(payslip)

    return {
        "id": payslip.id,
        "payroll_run_id": payslip.payroll_run_id,
        "employee_id": payslip.employee_id,
        "employee_name": payslip.employee.full_name if payslip.employee else "Unknown",
        "employee_no": payslip.employee.employee_no if payslip.employee else "",
        "period_start": payslip.payroll_run.period_start.isoformat() if payslip.payroll_run else None,
        "period_end": payslip.payroll_run.period_end.isoformat() if payslip.payroll_run else None,
        "earnings": payslip.earnings,
        "deductions": get_payslip_deductions_for_response(payslip),
        "total_earnings": float(totals["total_earnings"]),
        "total_deductions": float(totals["total_deductions"]),
        "net_pay": float(totals["net_pay"]),
        "days_worked": float(payslip.days_worked),
        "days_absent": float(payslip.days_absent),
        "late_count": payslip.late_count,
        "total_late_minutes": payslip.total_late_minutes,
        "overtime_hours": float(payslip.overtime_hours),
        "adjustments": payslip.adjustments,
        "adjustment_notes": payslip.adjustment_notes,
        "additional_amount": float(payslip.additional_amount or 0),
        "additional_notes": payslip.additional_notes,
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

    # Send email notifications
    emails_sent = 0
    for payslip in payslips:
        if payslip.employee and payslip.employee.email:
            try:
                employee_name = f"{payslip.employee.first_name} {payslip.employee.last_name}"
                period = f"{run.period_start.strftime('%b %d')} - {run.period_end.strftime('%b %d, %Y')}"
                net_pay = float(payslip.net_pay) if payslip.net_pay else 0.0

                email_service.send_payslip_notification(
                    to_email=payslip.employee.email,
                    employee_name=employee_name,
                    period=period,
                    net_pay=net_pay
                )
                emails_sent += 1
            except Exception as e:
                logger.error(f"Failed to send payslip email to {payslip.employee.email}: {e}")

    logger.info(f"Released {len(payslips)} payslips, sent {emails_sent} email notifications")
    return {"message": f"Released {len(payslips)} payslips to employees", "emails_sent": emails_sent}


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


    # Snapshot before changes
    old_snap = _snapshot_payslip(payslip)

    # Update earnings - create new dict to ensure SQLAlchemy detects change
    current_earnings = dict(payslip.earnings or {})
    current_earnings.update(earnings)
    migrate_overtime_key(current_earnings)
    payslip.earnings = current_earnings
    flag_modified(payslip, 'earnings')

    total = sum_earnings(current_earnings)
    payslip.total_earnings = total

    # Recalculate net pay (include additional_amount)
    payslip.net_pay = total - (payslip.total_deductions or Decimal('0'))

    # Audit trail
    new_snap = _snapshot_payslip(payslip)
    _audit_payslip_edit(db, payslip, old_snap, new_snap, current_admin, "earnings_edit")
    if run:
        sync_payroll_run_totals(db, run)

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


    # Snapshot before changes
    old_snap = _snapshot_payslip(payslip)

    # Update deductions - create new dict to ensure SQLAlchemy detects change
    cutoff = run.cutoff if run else 1
    current_deductions = sanitize_deductions_for_cutoff(payslip.deductions, cutoff)
    current_deductions.update(deductions)
    current_deductions = sanitize_deductions_for_cutoff(current_deductions, cutoff)
    payslip.deductions = current_deductions
    flag_modified(payslip, 'deductions')

    total = sum_saved_deductions(current_deductions, cutoff, payslip.earnings)
    payslip.total_deductions = total

    # Recalculate net pay (include additional_amount)
    payslip.net_pay = (payslip.total_earnings or Decimal('0')) - payslip.total_deductions

    # Audit trail
    new_snap = _snapshot_payslip(payslip)
    _audit_payslip_edit(db, payslip, old_snap, new_snap, current_admin, "deductions_edit")
    if run:
        sync_payroll_run_totals(db, run)

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

    # Snapshot before changes
    old_snap = _snapshot_payslip(payslip)


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
            settings = _get_payroll_settings(db)
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

                cutoff = run.cutoff if run else 1
                deductions = sanitize_deductions_for_cutoff(deductions, cutoff)

                # Assign deductions and flag as modified
                payslip.deductions = deductions
                flag_modified(payslip, 'deductions')

                # Recalculate total deductions based on cutoff
                total = sum_saved_deductions(deductions, cutoff, payslip.earnings)
                payslip.total_deductions = total
                additional_amt = payslip.additional_amount or Decimal('0')
                payslip.net_pay = (payslip.total_earnings or Decimal('0')) - payslip.total_deductions + additional_amt

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

    # Audit trail
    new_snap = _snapshot_payslip(payslip)
    _audit_payslip_edit(db, payslip, old_snap, new_snap, current_admin, "attendance_edit")
    if run:
        sync_payroll_run_totals(db, run)

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


@router.patch("/payslips/{payslip_id}/additional")
async def update_payslip_additional(
    payslip_id: int,
    additional: dict,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update payslip additional amount and notes (Admin only).
    Hidden fields for admin adjustments.
    """
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Check if locked
    run = db.query(PayrollRun).filter(PayrollRun.id == payslip.payroll_run_id).first()
    if run and run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot modify locked payroll")

    # Snapshot before changes
    old_snap = _snapshot_payslip(payslip)

    # Update additional fields
    if 'additional_amount' in additional:
        payslip.additional_amount = Decimal(str(additional['additional_amount'] or 0))
    if 'additional_notes' in additional:
        payslip.additional_notes = additional['additional_notes']

    # Recalculate net pay: total_earnings - total_deductions + additional_amount
    total_earnings = payslip.total_earnings or Decimal('0')
    total_deductions = payslip.total_deductions or Decimal('0')
    payslip.net_pay = total_earnings - total_deductions

    # Audit trail
    new_snap = _snapshot_payslip(payslip)
    _audit_payslip_edit(db, payslip, old_snap, new_snap, current_admin, "additional_edit")
    if run:
        sync_payroll_run_totals(db, run)

    db.commit()

    return {
        "message": "Additional updated",
        "additional_amount": float(payslip.additional_amount or 0),
        "additional_notes": payslip.additional_notes,
        "net_pay": float(payslip.net_pay)
    }


@router.post("/payslips/{payslip_id}/recalculate")
async def recalculate_single_payslip(
    payslip_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Recalculate a single payslip's totals from its current saved values.
    This does not overwrite earnings, deductions, rates, or attendance edits.
    """

    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    run = db.query(PayrollRun).filter(PayrollRun.id == payslip.payroll_run_id).first()
    if run and run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot modify locked payroll")

    old_snap = _snapshot_payslip(payslip)
    totals = recalculate_payslip_totals_from_saved_values(
        payslip,
        run.cutoff if run else 1
    )

    # Audit trail
    new_snap = _snapshot_payslip(payslip)
    _audit_payslip_edit(db, payslip, old_snap, new_snap, current_admin, "recalculate")
    if run:
        sync_payroll_run_totals(db, run)

    db.commit()

    return {
        "message": "Payslip totals recalculated",
        **totals,
    }


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
    if run:
        sync_payroll_run_totals(db, run)
    db.commit()

    return {"message": "Payslip deleted"}


# === Contribution Tables (Government Rates) ===

@router.get("/contributions", response_model=ContributionTableListResponse)
async def list_contribution_tables(
    contribution_type: Optional[ContributionType] = None,
    year: Optional[int] = None,
    include_inactive: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all contribution tables (Admin only)."""
    query = db.query(ContributionTable)

    if contribution_type:
        query = query.filter(ContributionTable.contribution_type == contribution_type)
    if year:
        query = query.filter(ContributionTable.effective_year == year)
    if not include_inactive:
        query = query.filter(ContributionTable.is_active == True)

    tables = query.order_by(
        ContributionTable.contribution_type,
        ContributionTable.effective_year.desc()
    ).all()

    return ContributionTableListResponse(
        items=[ContributionTableResponse.model_validate(t) for t in tables],
        total=len(tables)
    )


@router.get("/contributions/{table_id}", response_model=ContributionTableResponse)
async def get_contribution_table(
    table_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get a specific contribution table (Admin only)."""
    table = db.query(ContributionTable).filter(ContributionTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Contribution table not found")
    return ContributionTableResponse.model_validate(table)


@router.post("/contributions", response_model=ContributionTableResponse, status_code=status.HTTP_201_CREATED)
async def create_contribution_table(
    table_data: ContributionTableCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new contribution table (Admin only)."""
    # Check if table already exists for this type and year
    existing = db.query(ContributionTable).filter(
        ContributionTable.contribution_type == table_data.contribution_type,
        ContributionTable.effective_year == table_data.effective_year
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Contribution table for {table_data.contribution_type.value} {table_data.effective_year} already exists"
        )

    table = ContributionTable(
        contribution_type=table_data.contribution_type,
        effective_year=table_data.effective_year,
        name=table_data.name,
        description=table_data.description,
        brackets=table_data.brackets,
        is_active=table_data.is_active,
        created_by=current_admin.id
    )
    db.add(table)
    db.commit()
    db.refresh(table)

    return ContributionTableResponse.model_validate(table)


@router.patch("/contributions/{table_id}", response_model=ContributionTableResponse)
async def update_contribution_table(
    table_id: int,
    update_data: ContributionTableUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a contribution table (Admin only)."""
    table = db.query(ContributionTable).filter(ContributionTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Contribution table not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(table, field, value)

    db.commit()
    db.refresh(table)

    return ContributionTableResponse.model_validate(table)


@router.delete("/contributions/{table_id}")
async def delete_contribution_table(
    table_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a contribution table (Admin only). Sets is_active to False."""
    table = db.query(ContributionTable).filter(ContributionTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Contribution table not found")

    # Soft delete - just deactivate
    table.is_active = False
    db.commit()

    return {"message": "Contribution table deactivated"}


@router.post("/contributions/seed")
async def seed_contribution_tables(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Seed default contribution tables if they don't exist (Admin only)."""
    from app.core.database import seed_contribution_tables
    try:
        seed_contribution_tables()
        return {"message": "Contribution tables seeded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
            overtime_rate=1.30,
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
    cutoff = payslip.payroll_run.cutoff if payslip.payroll_run else 1
    deductions = sanitize_deductions_for_cutoff(payslip.deductions, cutoff)
    totals = get_payslip_totals_for_response(payslip)

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
        ('RH OT', earnings.get('regular_holiday_ot', 0)),
        ('SNWH', earnings.get('snwh', 0)),
        ('SNWH OT', earnings.get('snwh_ot', 0)),
        ('OT', earnings.get('overtime', 0) or earnings.get('overtime_pay', 0)),
    ]

    deduction_items = []
    if cutoff == 2:
        deduction_items.extend([
            ('SSS', deductions.get('sss', 0)),
            ('PH', deductions.get('philhealth', 0)),
            ('HDMF', deductions.get('pagibig', 0)),
        ])
    deduction_items.append(('Tax', deductions.get('tax', 0)))
    if cutoff == 1:
        deduction_items.extend([
            ('SSS Ln', deductions.get('sss_loan', 0)),
            ('HDMF Ln', deductions.get('pagibig_loan', 0)),
            ('Oth Ln', deductions.get('other_loan', 0)),
        ])
    deduction_items.extend([
        ('Abs', deductions.get('absences_amount', 0)),
        ('Late', deductions.get('late_amount', 0)),
    ])

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
    rows.append(['Total', fmt(totals["total_earnings"]), 'Total', fmt(totals["total_deductions"])])

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
    net_data = [['NET PAY:', fmt(totals["net_pay"])]]
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
    Size: 1600x2080 pixels by default, drawn from a 400x520 logical layout.
    The higher resolution keeps text sharp when the payslip is printed or zoomed.
    """
    from PIL import Image, ImageDraw, ImageFont

    # Calculate height: base 560 + extra rows for loans, optional earnings, and prorate
    earnings_data = payslip.earnings or {}
    cutoff = payslip.payroll_run.cutoff if payslip.payroll_run else 1
    deductions_data = sanitize_deductions_for_cutoff(payslip.deductions, cutoff)
    extra_rows = sum(1 for k in ('sss_loan', 'pagibig_loan', 'other_loan')
                     if float(deductions_data.get(k, 0) or 0) > 0)
    extra_rows += sum(1 for k in ('regular_holiday_ot', 'snwh', 'snwh_ot')
                      if float(earnings_data.get(k, 0) or 0) > 0)
    # Prorate adds significant height per period
    prorate_data = earnings_data.get('_prorate_info')
    if prorate_data and isinstance(prorate_data, list) and len(prorate_data) >= 2:
        extra_rows += 0  # Compact prorate fits in base height
    width, height = 400, 560 + (extra_rows * 14)
    scale = 4
    img = Image.new('RGB', (width * scale, height * scale), 'white')

    class ScaledDraw:
        """Draw with logical 400px coordinates onto a high-resolution image."""

        def __init__(self, image_draw, draw_scale):
            self.image_draw = image_draw
            self.draw_scale = draw_scale

        def _point(self, point):
            return tuple(int(round(v * self.draw_scale)) for v in point)

        def _points(self, points):
            return [self._point(point) for point in points]

        def text(self, xy, text, fill=None, font=None, anchor=None):
            self.image_draw.text(self._point(xy), text, fill=fill, font=font, anchor=anchor)

        def line(self, xy, fill=None, width=1):
            self.image_draw.line(self._points(xy), fill=fill, width=max(1, int(width * self.draw_scale)))

        def rectangle(self, xy, fill=None, outline=None, width=1):
            self.image_draw.rectangle(
                self._points(xy),
                fill=fill,
                outline=outline,
                width=max(1, int(width * self.draw_scale)),
            )

    draw = ScaledDraw(ImageDraw.Draw(img), scale)

    # Load fonts
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14 * scale)
        font_bold = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 11 * scale)
        font_normal = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 10 * scale)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 9 * scale)
        font_tiny = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 7 * scale)
    except:
        font_title = ImageFont.load_default()
        font_bold = font_title
        font_normal = font_title
        font_small = font_title
        font_tiny = font_title

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
    deductions = sanitize_deductions_for_cutoff(payslip.deductions, cutoff)
    totals = get_payslip_totals_for_response(payslip)

    def fmt(amount, zero_dash: bool = True):
        """Format currency."""
        try:
            val = float(amount or 0)
            if val == 0 and zero_dash:
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

    # Hours and Schedule - read from employee settings
    work_hours = int(employee.work_hours_per_day) if employee and employee.work_hours_per_day else 8
    emp_call_time = employee.call_time if employee and employee.call_time else "08:00"
    emp_time_out = employee.time_out if employee and employee.time_out else "17:00"

    def _fmt_time_12h(t):
        try:
            h, m = map(int, t.split(':'))
            suffix = "am" if h < 12 else "pm"
            h12 = h if h <= 12 else h - 12
            if h12 == 0:
                h12 = 12
            return f"{h12}:{m:02d}{suffix}" if m else f"{h12}{suffix}"
        except Exception:
            return t

    schedule_str = f"{_fmt_time_12h(emp_call_time)} - {_fmt_time_12h(emp_time_out)}"

    draw.text((col1, y), "Hours:", fill='black', font=font_small)
    draw.text((col1 + 40, y), f"{work_hours}hrs", fill='black', font=font_normal)
    draw.text((col1 + 80, y), "Schedule:", fill='black', font=font_small)
    draw.text((col1 + 130, y), schedule_str, fill='black', font=font_normal)
    y += 18

    # Divider
    draw.line([(margin, y), (width - margin, y)], fill='black', width=1)
    y += 8

    # === SALARY SECTION HEADERS ===
    left_col = margin
    left_val = margin + 110
    right_col = mid_x + 5
    right_val = width - margin - 10

    # Section headers (drawn once, prorate or normal)
    prorate_info = earnings.get('_prorate_info')
    is_prorated = prorate_info and isinstance(prorate_info, list) and len(prorate_info) >= 2

    draw.text((left_col, y), "Rate Info", fill='black', font=font_bold)
    draw.text((right_col, y), "Earnings", fill='black', font=font_bold)
    y += 16

    # Get rate values from employee
    basic_monthly = float(employee.basic_salary or 0) if employee else 0
    daily_rate = float(employee.daily_rate or 0) if employee else 0
    hourly_rate = float(employee.hourly_rate or 0) if employee else 0
    work_hours = float(employee.work_hours_per_day or 8) if employee else 8

    # Get earnings values from payslip (static, not divided)
    basic_semi = float(earnings.get('basic_semi', 0))
    allowance_val = float(earnings.get('allowance_semi', 0))
    prod_val = float(earnings.get('productivity_incentive_semi', 0))
    lang_val = float(earnings.get('language_incentive_semi', 0))
    reg_ot = float(earnings.get('overtime', 0) or earnings.get('overtime_pay', 0))
    holiday = float(earnings.get('regular_holiday', 0))
    holiday_ot = float(earnings.get('regular_holiday_ot', 0))
    snwh_pay = float(earnings.get('snwh', 0))
    snwh_ot = float(earnings.get('snwh_ot', 0))

    # === EARNINGS ROWS ===
    row_height = 14
    amt_x = width - margin - 10

    if is_prorated:
        # ---- COMPACT PRORATED LAYOUT (fits same height as normal) ----
        rh = 12  # Tight row height
        try:
            font_xs = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 8 * scale)
        except:
            font_xs = font_small

        # Column positions for compact table
        c1 = left_col       # Label
        c2 = left_col + 80  # P1 value
        c3 = mid_x + 10     # P2 value (or P2 label area)

        draw.text((left_col, y), f"PRORATED ({len(prorate_info)} Periods)", fill='#6b21a8', font=font_bold)
        y += rh + 2

        # Table header: blank | P1 dates | P2 dates
        for pi, period in enumerate(prorate_info):
            p_start = period.get('startDate', '')
            p_end = period.get('endDate', '')
            p_days = period.get('daysWorked', 0)
            p_hrs = period.get('workHours', 8)
            col_x = c2 if pi == 0 else c3
            date_short = p_start[5:] if p_start else ''
            end_short = p_end[5:] if p_end else ''
            draw.text((col_x, y), f"P{pi+1}: {date_short}~{end_short}", fill='#6b21a8', font=font_xs)
        y += rh

        # Sub-header: days/hrs
        for pi, period in enumerate(prorate_info):
            col_x = c2 if pi == 0 else c3
            draw.text((col_x, y), f"{period.get('daysWorked',0)}d | {period.get('workHours',8)}hrs", fill='gray', font=font_xs)
        y += rh

        # Data rows — label | P1 value | P2 value
        def prorate_row(label, values, color='black'):
            nonlocal y
            draw.text((c1, y), label, fill=color, font=font_xs)
            for vi, v in enumerate(values):
                col_x = c2 if vi == 0 else c3
                draw.text((col_x + 75, y), fmt(v), fill=color, font=font_xs, anchor='rt')
            y += rh

        periods_data = []
        for period in prorate_info:
            periods_data.append({
                'monthly': float(period.get('monthlyBasic', 0)),
                'daily': float(period.get('dailyRate', 0)),
                'basic': float(period.get('basicEarned', 0)),
                'allow': float(period.get('allowanceEarned', 0)),
                'prod': float(period.get('productivityEarned', 0)),
                'lang': float(period.get('languageEarned', 0)),
                'ot': float(period.get('otPay', 0)),
                'hol': float(period.get('regularHoliday', 0)),
                'total': float(period.get('totalEarnings', 0)),
                'absent': float(period.get('absentDeduction', 0)),
                'late': float(period.get('lateDeduction', 0)),
            })

        prorate_row("Monthly", [p['monthly'] for p in periods_data], 'gray')
        prorate_row("Daily Rate", [p['daily'] for p in periods_data], 'gray')
        prorate_row("Basic", [p['basic'] for p in periods_data])
        prorate_row("Allowance", [p['allow'] for p in periods_data])
        prorate_row("Productivity", [p['prod'] for p in periods_data])
        prorate_row("Language", [p['lang'] for p in periods_data])

        # Optional rows
        if any(p['ot'] > 0 for p in periods_data):
            prorate_row("Overtime", [p['ot'] for p in periods_data])
        if any(p['hol'] > 0 for p in periods_data):
            prorate_row("Holiday", [p['hol'] for p in periods_data])
    else:
        # ---- NORMAL (NON-PRORATED) PAYSLIP LAYOUT ----
        # Row 1: Basic Salary (monthly) / Basic (semi)
        draw.text((left_col, y), "Basic Salary", fill='black', font=font_small)
        draw.text((left_val, y), fmt(basic_monthly), fill='black', font=font_normal, anchor='rt')
        draw.text((right_col, y), "Basic (Semi)", fill='black', font=font_small)
        draw.text((right_val, y), fmt(basic_semi), fill='black', font=font_normal, anchor='rt')
        y += row_height

        # Row 2: Daily Rate / Allowance
        draw.text((left_col, y), "Daily Rate", fill='black', font=font_small)
        draw.text((left_val, y), fmt(daily_rate), fill='black', font=font_normal, anchor='rt')
        draw.text((right_col, y), "Allowance", fill='black', font=font_small)
        draw.text((right_val, y), fmt(allowance_val), fill='black', font=font_normal, anchor='rt')
        y += row_height

        # Row 3: Hourly Rate / Prod Incentive
        draw.text((left_col, y), "Hourly Rate", fill='black', font=font_small)
        draw.text((left_val, y), fmt(hourly_rate), fill='black', font=font_normal, anchor='rt')
        draw.text((right_col, y), "Prod Incentive", fill='black', font=font_small)
        draw.text((right_val, y), fmt(prod_val), fill='black', font=font_normal, anchor='rt')
        y += row_height

        # Row 4: Work Hours / Lang Incentive
        draw.text((left_col, y), "Work Hours/Day", fill='black', font=font_small)
        draw.text((left_val, y), f"{int(work_hours)}", fill='black', font=font_normal, anchor='rt')
        draw.text((right_col, y), "Lang Incentive", fill='black', font=font_small)
        draw.text((right_val, y), fmt(lang_val), fill='black', font=font_normal, anchor='rt')
        y += row_height + 6

        # Row 5: Overtime
        draw.text((right_col, y), "Overtime", fill='black', font=font_small)
        draw.text((right_val, y), fmt(reg_ot), fill='black', font=font_normal, anchor='rt')
        y += row_height

        # Row 6: Holiday
        draw.text((right_col, y), "Holiday", fill='black', font=font_small)
        draw.text((right_val, y), fmt(holiday), fill='black', font=font_normal, anchor='rt')
        y += row_height

        # Extra earnings rows
        if holiday_ot > 0:
            draw.text((right_col, y), "Holiday OT", fill='black', font=font_small)
            draw.text((right_val, y), fmt(holiday_ot), fill='black', font=font_normal, anchor='rt')
            y += row_height

        if snwh_pay > 0:
            draw.text((right_col, y), "SNWH", fill='black', font=font_small)
            draw.text((right_val, y), fmt(snwh_pay), fill='black', font=font_normal, anchor='rt')
            y += row_height

        if snwh_ot > 0:
            draw.text((right_col, y), "SNWH OT", fill='black', font=font_small)
            draw.text((right_val, y), fmt(snwh_ot), fill='black', font=font_normal, anchor='rt')
            y += row_height

    # === ABSENCES/LATES ===
    absent_amt = float(deductions.get('absences_amount', 0) or 0)
    late_amt = float(deductions.get('late_amount', 0) or 0)
    y += 14

    # Divider
    draw.line([(margin, y), (width - margin, y)], fill='black', width=1)
    y += 8

    # === DEDUCTIONS ===
    sss = float(deductions.get('sss', 0))
    philhealth = float(deductions.get('philhealth', 0))
    hdmf = float(deductions.get('pagibig', 0))
    wtax = float(deductions.get('tax', 0))
    sss_loan = float(deductions.get('sss_loan', 0))
    pagibig_loan = float(deductions.get('pagibig_loan', 0))
    other_loan = float(deductions.get('other_loan', 0))
    absent_days = float(payslip.days_absent or deductions.get('absent_days', 0) or 0)
    absent_rate = absent_amt / absent_days if absent_days else daily_rate
    late_minutes = int(payslip.total_late_minutes or deductions.get('late_minutes', 0) or 0)
    late_hours = late_minutes / 60
    late_rate = (late_amt / late_hours) if late_hours else hourly_rate
    attendance_val = mid_x - 20

    deductions_y = y
    draw.text((left_col, deductions_y), "Attendance Deductions", fill='black', font=font_bold)
    draw.text((left_col, deductions_y + 16), "Absent Deduction", fill='black', font=font_small)
    draw.text((attendance_val, deductions_y + 16), fmt(absent_amt), fill='black', font=font_normal, anchor='rt')
    draw.text(
        (left_col, deductions_y + 26),
        f"{absent_days:g} day(s) x {fmt(absent_rate)}",
        fill='black',
        font=font_tiny,
    )
    draw.text((left_col, deductions_y + 42), "Late Deduction", fill='black', font=font_small)
    draw.text((attendance_val, deductions_y + 42), fmt(late_amt), fill='black', font=font_normal, anchor='rt')
    draw.text(
        (left_col, deductions_y + 52),
        f"{late_hours:.2f}h x {fmt(late_rate)}/hr",
        fill='black',
        font=font_tiny,
    )

    other_y = deductions_y
    if cutoff == 1:
        draw.text((right_col, other_y), "Loans", fill='black', font=font_bold)
        other_y += 16
        for label, amount in (
            ("SSS Loan", sss_loan),
            ("HDMF Loan", pagibig_loan),
            ("Other Loan", other_loan),
        ):
            draw.text((right_col, other_y), label, fill='black', font=font_small)
            draw.text((right_val, other_y), fmt(amount), fill='black', font=font_normal, anchor='rt')
            other_y += row_height
    else:
        draw.text((right_col, other_y), "GOV'T Deductions", fill='black', font=font_bold)
        other_y += 16
        for label, amount in (
            ("SSS", sss),
            ("PHIL", philhealth),
            ("HDMF", hdmf),
            ("Wtax", wtax),
        ):
            draw.text((right_col, other_y), label, fill='black', font=font_small)
            draw.text((right_val, other_y), fmt(amount), fill='black', font=font_normal, anchor='rt')
            other_y += row_height

    y = max(deductions_y + 66, other_y) + 8

    # === NET PAY ===
    draw.rectangle([(right_col - 5, y - 2), (right_val + 5, y + 18)], outline='black', width=2)
    draw.text((right_col, y + 2), "Net Pay", fill='black', font=font_bold)
    draw.text((right_val, y + 2), fmt(totals["net_pay"], zero_dash=False), fill='black', font=font_bold, anchor='rt')
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
    draw.text((sig_col1, y + 12), "Gemma Termulo", fill='black', font=font_small)
    draw.text((sig_col2, y + 12), "Lee Hyunsoo", fill='black', font=font_small)
    y += 42

    draw.text((sig_col1, y), "Received by:", fill='black', font=font_small)
    y += 30

    draw.line([(sig_col1, y), (sig_col1 + 100, y)], fill='black', width=1)
    draw.text((sig_col1, y + 12), emp_name, fill='black', font=font_small)

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

    slip_w = 0
    # Find the max dimensions across all payslips (varies with loan and detail rows).
    slip_images = []
    max_h = 0
    for payslip in payslips[:4]:
        slip_bytes = generate_payslip_png(payslip, company_name)
        slip_img = Image.open(io.BytesIO(slip_bytes))
        if slip_img.width > slip_w:
            slip_w = slip_img.width
        if slip_img.height > max_h:
            max_h = slip_img.height
        slip_images.append(slip_img)

    if not slip_images:
        slip_w = 400
        max_h = 520

    # 2 columns, 2 rows - use max height so all cells are uniform
    cols, rows = 2, 2
    sheet_w = slip_w * cols
    sheet_h = max_h * rows

    sheet = Image.new('RGB', (sheet_w, sheet_h), 'white')

    for idx, slip_img in enumerate(slip_images):
        col = idx % cols
        row = idx // cols
        x = col * slip_w
        y = row * max_h
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


@router.get("/runs/{run_id}/all-payslips-pdf")
async def download_all_payslips_pdf(
    run_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Download ALL payslips for a payroll run as a single PDF file.
    Arranges 4 payslips per A4 page in a 2x2 grid.
    """
    from PIL import Image
    from app.models.settings import SystemSettings

    payroll_run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not payroll_run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    payslips = db.query(Payslip).filter(
        Payslip.payroll_run_id == run_id
    ).order_by(Payslip.id).all()

    if not payslips:
        raise HTTPException(status_code=404, detail="No payslips found")

    settings = db.query(SystemSettings).first()
    company_name = settings.company_name if settings else "I CAN LANGUAGE CENTER INC."

    cols, rows_per_page = 2, 2
    per_page = cols * rows_per_page

    # Pre-generate all PNGs to get actual heights
    slip_images = []
    for payslip in payslips:
        slip_bytes = generate_payslip_png(payslip, company_name)
        slip_images.append(Image.open(io.BytesIO(slip_bytes)))

    pages = []
    for page_idx in range(0, len(slip_images), per_page):
        batch = slip_images[page_idx:page_idx + per_page]
        slip_w = max(s.width for s in batch)

        # Find max height per row for this page
        row_heights = []
        for r in range(rows_per_page):
            row_slips = batch[r * cols:(r + 1) * cols]
            if row_slips:
                row_heights.append(max(s.height for s in row_slips))
            else:
                row_heights.append(0)

        sheet_w = slip_w * cols
        sheet_h = sum(row_heights)
        sheet = Image.new('RGB', (sheet_w, sheet_h), 'white')

        for idx, slip_img in enumerate(batch):
            col = idx % cols
            row = idx // cols
            x = col * slip_w
            y_offset = sum(row_heights[:row])
            sheet.paste(slip_img, (x, y_offset))

        pages.append(sheet)

    buffer = io.BytesIO()
    if len(pages) == 1:
        pages[0].save(buffer, format='PDF', resolution=400.0)
    else:
        pages[0].save(buffer, format='PDF', resolution=400.0, save_all=True, append_images=pages[1:])
    buffer.seek(0)

    period_code = payroll_run.period_start.strftime('%y%m')
    cutoff = 'A' if payroll_run.cutoff == 1 else 'B'
    filename = f"PAYSLIPS-{period_code}{cutoff}-ALL.pdf"

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


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
async def import_payslips(
    file: UploadFile = File(...),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Import payslips from Excel file.

    Just upload the 'Payroll List' Excel file - that's it!
    - Matches employees by full name
    - Updates their Employee record (basic salary, allowance, deductions, etc.)
    - Overwrites existing data when reimporting
    """
    from app.services.payroll_import import import_payslip_file

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

        # Process the file - simple import, no period/cutoff needed
        result = import_payslip_file(
            db=db,
            file_path=tmp_path,
            sheet_name='Payroll List '
        )

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
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


# ═══════════════════════════════════════════════════════════════
# PAYSLIP VERSION HISTORY & POINT-IN-TIME RESTORE
# ═══════════════════════════════════════════════════════════════

@router.get("/payslips/{payslip_id}/history")
async def get_payslip_history(
    payslip_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get full edit history for a payslip. Each entry is a restorable snapshot."""
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    logs = db.query(AuditLog).filter(
        AuditLog.resource_type == "payslip",
        AuditLog.resource_id == str(payslip_id),
        AuditLog.action.in_([AuditAction.PAYSLIP_EDIT, AuditAction.PAYSLIP_RESTORE])
    ).order_by(AuditLog.timestamp.desc()).all()

    items = []
    for log in logs:
        change_type = ""
        if log.extra_data:
            change_type = log.extra_data.get("change_type", "")

        # Describe the change
        description = _describe_change(log.action, change_type, log.old_value, log.new_value, log.extra_data)

        items.append({
            "id": log.id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            "user_email": log.user_email,
            "action": log.action.value,
            "change_type": change_type,
            "description": description,
            "snapshot": log.new_value,  # The state AFTER this change
            "old_snapshot": log.old_value,  # The state BEFORE this change
            "reason": log.reason,
        })

    return {"items": items, "total": len(items)}


def _describe_change(action, change_type, old_val, new_val, extra_data):
    """Generate human-readable description of a payslip change."""
    if action == AuditAction.PAYSLIP_RESTORE:
        restored_from = extra_data.get("restored_from_date", "") if extra_data else ""
        return f"Restored to {restored_from} state"

    if not old_val or not new_val:
        return change_type.replace("_", " ").title()

    changes = []
    # Compare key numeric fields
    fields_to_check = [
        ("total_earnings", "Total Earnings"),
        ("total_deductions", "Total Deductions"),
        ("net_pay", "Net Pay"),
        ("days_worked", "Days Worked"),
        ("days_absent", "Days Absent"),
        ("total_late_minutes", "Late Minutes"),
        ("additional_amount", "Additional Amount"),
    ]
    for key, label in fields_to_check:
        old_v = old_val.get(key, 0) or 0
        new_v = new_val.get(key, 0) or 0
        if abs(float(old_v) - float(new_v)) > 0.001:
            changes.append(f"{label}: {float(old_v):,.2f} → {float(new_v):,.2f}")

    if changes:
        return "; ".join(changes[:3])  # Show up to 3 changes
    return change_type.replace("_", " ").title()


@router.post("/payslips/{payslip_id}/restore/{audit_log_id}")
async def restore_payslip_to_snapshot(
    payslip_id: int,
    audit_log_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Restore a payslip to a specific point in history.
    This itself creates an audit entry so it can be undone.
    """
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    # Check if locked
    run = db.query(PayrollRun).filter(PayrollRun.id == payslip.payroll_run_id).first()
    if run and run.status == PayrollStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot modify locked payroll")

    # Get the audit log entry to restore from
    audit_entry = db.query(AuditLog).filter(AuditLog.id == audit_log_id).first()
    if not audit_entry:
        raise HTTPException(status_code=404, detail="Audit log entry not found")
    if audit_entry.resource_type != "payslip" or audit_entry.resource_id != str(payslip_id):
        raise HTTPException(status_code=400, detail="Audit entry does not belong to this payslip")

    # Get the snapshot to restore to (the state AFTER that change was made)
    snapshot = audit_entry.new_value
    if not snapshot:
        raise HTTPException(status_code=400, detail="No snapshot data available for this entry")


    # Snapshot current state before restore
    old_snap = _snapshot_payslip(payslip)

    # Restore payslip fields from snapshot
    if snapshot.get("earnings"):
        payslip.earnings = snapshot["earnings"]
        flag_modified(payslip, 'earnings')
    if snapshot.get("deductions"):
        payslip.deductions = snapshot["deductions"]
        flag_modified(payslip, 'deductions')

    payslip.total_earnings = Decimal(str(snapshot.get("total_earnings", 0)))
    payslip.total_deductions = Decimal(str(snapshot.get("total_deductions", 0)))
    payslip.net_pay = Decimal(str(snapshot.get("net_pay", 0)))
    payslip.days_worked = Decimal(str(snapshot.get("days_worked", 0)))
    payslip.days_absent = Decimal(str(snapshot.get("days_absent", 0)))
    payslip.late_count = int(snapshot.get("late_count", 0))
    payslip.total_late_minutes = int(snapshot.get("total_late_minutes", 0))
    payslip.overtime_hours = Decimal(str(snapshot.get("overtime_hours", 0)))
    payslip.additional_amount = Decimal(str(snapshot.get("additional_amount", 0)))
    payslip.additional_notes = snapshot.get("additional_notes")

    # Create audit entry for the restore action
    restored_date = audit_entry.timestamp.strftime("%b %d, %Y %I:%M %p") if audit_entry.timestamp else "unknown"
    new_snap = _snapshot_payslip(payslip)
    audit = AuditLog(
        user_id=current_admin.id,
        user_email=current_admin.email,
        action=AuditAction.PAYSLIP_RESTORE,
        resource_type="payslip",
        resource_id=str(payslip.id),
        old_value=old_snap,
        new_value=new_snap,
        reason=f"Restored to {restored_date} state",
        extra_data={
            "employee_id": payslip.employee_id,
            "employee_name": new_snap.get("employee_name", ""),
            "payroll_run_id": payslip.payroll_run_id,
            "change_type": "restore",
            "restored_from_audit_id": audit_log_id,
            "restored_from_date": restored_date,
        }
    )
    db.add(audit)
    db.commit()

    return {
        "message": f"Payslip restored to {restored_date} state",
        "total_earnings": float(payslip.total_earnings),
        "total_deductions": float(payslip.total_deductions),
        "net_pay": float(payslip.net_pay),
    }
