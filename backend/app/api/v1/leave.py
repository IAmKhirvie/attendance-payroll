"""
Leave Management API Endpoints
==============================
CRUD operations for leave types, balances, and requests.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional, List
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_db, get_current_admin, get_current_user
from app.models.user import User
from app.models.employee import Employee
from app.models.leave import LeaveTypeConfig, LeaveBalance, LeaveRequest, LeaveStatus
from app.models.holiday import Holiday
from app.schemas.leave import (
    LeaveTypeConfigCreate, LeaveTypeConfigUpdate, LeaveTypeConfigResponse, LeaveTypeConfigListResponse,
    LeaveBalanceCreate, LeaveBalanceUpdate, LeaveBalanceResponse, LeaveBalanceListResponse,
    EmployeeLeaveBalanceSummary, BulkLeaveBalanceCreate,
    LeaveRequestCreate, LeaveRequestUpdate, LeaveRequestResponse, LeaveRequestListResponse,
    LeaveRequestApproval, LeaveCalendarEntry
)
from app.services.email_service import email_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# ================== Helper Functions ==================

def count_working_days(start_date: date, end_date: date, db: Session) -> Decimal:
    """
    Count working days between two dates, excluding weekends and holidays.
    """
    if start_date > end_date:
        return Decimal("0")

    # Get holidays in the date range
    holidays = db.query(Holiday.date).filter(
        Holiday.date.between(start_date, end_date),
        Holiday.is_active == True
    ).all()
    holiday_dates = {h.date for h in holidays}

    # Count working days (exclude weekends and holidays)
    count = 0
    current = start_date
    while current <= end_date:
        # 0=Monday, 6=Sunday
        if current.weekday() < 5 and current not in holiday_dates:
            count += 1
        current += timedelta(days=1)

    return Decimal(str(count))


def update_leave_balance_on_request(request: LeaveRequest, db: Session, action: str):
    """
    Update leave balance when request status changes.
    action: 'create', 'approve', 'reject', 'cancel'
    """
    year = request.start_date.year
    balance = db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == request.employee_id,
        LeaveBalance.leave_type_id == request.leave_type_id,
        LeaveBalance.year == year
    ).first()

    if not balance:
        return  # No balance to update

    if action == 'create':
        balance.pending_days = balance.pending_days + request.total_days
    elif action == 'approve':
        balance.pending_days = balance.pending_days - request.total_days
        balance.used_days = balance.used_days + request.total_days
    elif action == 'reject':
        balance.pending_days = balance.pending_days - request.total_days
    elif action == 'cancel':
        if request.status == LeaveStatus.PENDING:
            balance.pending_days = balance.pending_days - request.total_days
        elif request.status == LeaveStatus.APPROVED:
            balance.used_days = balance.used_days - request.total_days


# ================== Leave Type Config Endpoints ==================

@router.get("/types", response_model=LeaveTypeConfigListResponse)
async def list_leave_types(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all leave types."""
    query = db.query(LeaveTypeConfig)
    if not include_inactive:
        query = query.filter(LeaveTypeConfig.is_active == True)

    leave_types = query.order_by(LeaveTypeConfig.code).all()

    return LeaveTypeConfigListResponse(
        items=[LeaveTypeConfigResponse.model_validate(lt) for lt in leave_types],
        total=len(leave_types)
    )


@router.post("/types", response_model=LeaveTypeConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_leave_type(
    data: LeaveTypeConfigCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new leave type (Admin only)."""
    existing = db.query(LeaveTypeConfig).filter(LeaveTypeConfig.code == data.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Leave type code '{data.code}' already exists")

    leave_type = LeaveTypeConfig(
        code=data.code.upper(),
        name=data.name,
        description=data.description,
        default_days_per_year=data.default_days_per_year,
        is_paid=data.is_paid,
        requires_document=data.requires_document,
        max_consecutive_days=data.max_consecutive_days,
        min_notice_days=data.min_notice_days,
        is_accrued=data.is_accrued,
        accrual_rate_per_month=data.accrual_rate_per_month,
        can_carry_over=data.can_carry_over,
        max_carry_over_days=data.max_carry_over_days,
        is_active=data.is_active
    )
    db.add(leave_type)
    db.commit()
    db.refresh(leave_type)

    return LeaveTypeConfigResponse.model_validate(leave_type)


@router.patch("/types/{type_id}", response_model=LeaveTypeConfigResponse)
async def update_leave_type(
    type_id: int,
    data: LeaveTypeConfigUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a leave type (Admin only)."""
    leave_type = db.query(LeaveTypeConfig).filter(LeaveTypeConfig.id == type_id).first()
    if not leave_type:
        raise HTTPException(status_code=404, detail="Leave type not found")

    update_dict = data.model_dump(exclude_unset=True)
    if 'code' in update_dict:
        update_dict['code'] = update_dict['code'].upper()

    for field, value in update_dict.items():
        setattr(leave_type, field, value)

    db.commit()
    db.refresh(leave_type)

    return LeaveTypeConfigResponse.model_validate(leave_type)


@router.delete("/types/{type_id}")
async def delete_leave_type(
    type_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a leave type (Admin only). Deactivates if in use."""
    leave_type = db.query(LeaveTypeConfig).filter(LeaveTypeConfig.id == type_id).first()
    if not leave_type:
        raise HTTPException(status_code=404, detail="Leave type not found")

    # Check if in use
    balance_count = db.query(LeaveBalance).filter(LeaveBalance.leave_type_id == type_id).count()
    request_count = db.query(LeaveRequest).filter(LeaveRequest.leave_type_id == type_id).count()

    if balance_count > 0 or request_count > 0:
        leave_type.is_active = False
        db.commit()
        return {"message": "Leave type deactivated (has associated records)"}

    db.delete(leave_type)
    db.commit()
    return {"message": "Leave type deleted"}


@router.post("/types/seed")
async def seed_leave_types(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Seed default Philippine leave types (Admin only)."""
    default_types = [
        {"code": "VL", "name": "Vacation Leave", "days": 15, "paid": True, "doc": False,
         "desc": "Annual vacation leave"},
        {"code": "SL", "name": "Sick Leave", "days": 15, "paid": True, "doc": True,
         "desc": "Sick leave with medical certificate for 3+ days"},
        {"code": "ML", "name": "Maternity Leave", "days": 105, "paid": True, "doc": True,
         "desc": "105 days for live childbirth (RA 11210)"},
        {"code": "PL", "name": "Paternity Leave", "days": 7, "paid": True, "doc": True,
         "desc": "7 days for married male employees (RA 8187)"},
        {"code": "SPL", "name": "Solo Parent Leave", "days": 7, "paid": True, "doc": True,
         "desc": "7 days for solo parents (RA 8972)"},
        {"code": "VAWC", "name": "VAWC Leave", "days": 10, "paid": True, "doc": True,
         "desc": "10 days for victims of violence (RA 9262)"},
        {"code": "SIL", "name": "Service Incentive Leave", "days": 5, "paid": True, "doc": False,
         "desc": "5 days mandatory SIL after 1 year"},
        {"code": "BL", "name": "Bereavement Leave", "days": 3, "paid": True, "doc": False,
         "desc": "Leave for death of immediate family"},
        {"code": "EL", "name": "Emergency Leave", "days": 3, "paid": True, "doc": False,
         "desc": "Leave for emergencies"},
        {"code": "LWOP", "name": "Leave Without Pay", "days": 0, "paid": False, "doc": False,
         "desc": "Unpaid leave"},
    ]

    seeded = 0
    for lt in default_types:
        existing = db.query(LeaveTypeConfig).filter(LeaveTypeConfig.code == lt["code"]).first()
        if not existing:
            leave_type = LeaveTypeConfig(
                code=lt["code"],
                name=lt["name"],
                description=lt["desc"],
                default_days_per_year=Decimal(str(lt["days"])),
                is_paid=lt["paid"],
                requires_document=lt["doc"],
                is_active=True
            )
            db.add(leave_type)
            seeded += 1

    db.commit()
    return {"message": f"Seeded {seeded} leave types", "seeded": seeded}


# ================== Leave Balance Endpoints ==================

@router.get("/balances", response_model=LeaveBalanceListResponse)
async def list_leave_balances(
    employee_id: Optional[int] = None,
    leave_type_id: Optional[int] = None,
    year: Optional[int] = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List leave balances (Admin only)."""
    query = db.query(LeaveBalance)

    if employee_id:
        query = query.filter(LeaveBalance.employee_id == employee_id)
    if leave_type_id:
        query = query.filter(LeaveBalance.leave_type_id == leave_type_id)
    if year:
        query = query.filter(LeaveBalance.year == year)
    else:
        query = query.filter(LeaveBalance.year == date.today().year)

    balances = query.all()

    items = []
    for balance in balances:
        response = LeaveBalanceResponse(
            id=balance.id,
            employee_id=balance.employee_id,
            leave_type_id=balance.leave_type_id,
            year=balance.year,
            entitled_days=balance.entitled_days,
            used_days=balance.used_days,
            pending_days=balance.pending_days,
            carried_over_days=balance.carried_over_days,
            remaining_days=Decimal(str(balance.remaining_days)),
            created_at=balance.created_at,
            updated_at=balance.updated_at
        )
        if balance.employee:
            response.employee_name = f"{balance.employee.first_name} {balance.employee.last_name}"
            response.employee_no = balance.employee.employee_no
        if balance.leave_type:
            response.leave_type_code = balance.leave_type.code
            response.leave_type_name = balance.leave_type.name
        items.append(response)

    return LeaveBalanceListResponse(items=items, total=len(items))


@router.post("/balances", response_model=LeaveBalanceResponse, status_code=status.HTTP_201_CREATED)
async def create_leave_balance(
    data: LeaveBalanceCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create leave balance for an employee (Admin only)."""
    # Verify employee and leave type exist
    employee = db.query(Employee).filter(Employee.id == data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    leave_type = db.query(LeaveTypeConfig).filter(LeaveTypeConfig.id == data.leave_type_id).first()
    if not leave_type:
        raise HTTPException(status_code=404, detail="Leave type not found")

    # Check for existing balance
    existing = db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == data.employee_id,
        LeaveBalance.leave_type_id == data.leave_type_id,
        LeaveBalance.year == data.year
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Balance already exists for this employee/type/year")

    balance = LeaveBalance(
        employee_id=data.employee_id,
        leave_type_id=data.leave_type_id,
        year=data.year,
        entitled_days=data.entitled_days,
        carried_over_days=data.carried_over_days,
        used_days=Decimal("0"),
        pending_days=Decimal("0")
    )
    db.add(balance)
    db.commit()
    db.refresh(balance)

    response = LeaveBalanceResponse(
        id=balance.id,
        employee_id=balance.employee_id,
        employee_name=f"{employee.first_name} {employee.last_name}",
        employee_no=employee.employee_no,
        leave_type_id=balance.leave_type_id,
        leave_type_code=leave_type.code,
        leave_type_name=leave_type.name,
        year=balance.year,
        entitled_days=balance.entitled_days,
        used_days=balance.used_days,
        pending_days=balance.pending_days,
        carried_over_days=balance.carried_over_days,
        remaining_days=Decimal(str(balance.remaining_days)),
        created_at=balance.created_at,
        updated_at=balance.updated_at
    )
    return response


@router.patch("/balances/{balance_id}", response_model=LeaveBalanceResponse)
async def update_leave_balance(
    balance_id: int,
    data: LeaveBalanceUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update leave balance (Admin only)."""
    balance = db.query(LeaveBalance).filter(LeaveBalance.id == balance_id).first()
    if not balance:
        raise HTTPException(status_code=404, detail="Leave balance not found")

    update_dict = data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(balance, field, value)

    db.commit()
    db.refresh(balance)

    response = LeaveBalanceResponse(
        id=balance.id,
        employee_id=balance.employee_id,
        leave_type_id=balance.leave_type_id,
        year=balance.year,
        entitled_days=balance.entitled_days,
        used_days=balance.used_days,
        pending_days=balance.pending_days,
        carried_over_days=balance.carried_over_days,
        remaining_days=Decimal(str(balance.remaining_days)),
        created_at=balance.created_at,
        updated_at=balance.updated_at
    )
    if balance.employee:
        response.employee_name = f"{balance.employee.first_name} {balance.employee.last_name}"
        response.employee_no = balance.employee.employee_no
    if balance.leave_type:
        response.leave_type_code = balance.leave_type.code
        response.leave_type_name = balance.leave_type.name

    return response


@router.post("/balances/initialize")
async def initialize_balances(
    data: BulkLeaveBalanceCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Initialize leave balances for multiple employees (Admin only)."""
    # Get all active leave types
    leave_types = db.query(LeaveTypeConfig).filter(LeaveTypeConfig.is_active == True).all()
    if not leave_types:
        raise HTTPException(status_code=400, detail="No active leave types found")

    created = 0
    skipped = 0

    for employee_id in data.employee_ids:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            skipped += 1
            continue

        for leave_type in leave_types:
            # Check if balance already exists
            existing = db.query(LeaveBalance).filter(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type_id == leave_type.id,
                LeaveBalance.year == data.year
            ).first()

            if existing:
                skipped += 1
                continue

            balance = LeaveBalance(
                employee_id=employee_id,
                leave_type_id=leave_type.id,
                year=data.year,
                entitled_days=leave_type.default_days_per_year if data.use_defaults else Decimal("0"),
                carried_over_days=Decimal("0"),
                used_days=Decimal("0"),
                pending_days=Decimal("0")
            )
            db.add(balance)
            created += 1

    db.commit()

    return {
        "message": f"Created {created} balances, skipped {skipped}",
        "created": created,
        "skipped": skipped
    }


@router.get("/balances/employee/{employee_id}", response_model=EmployeeLeaveBalanceSummary)
async def get_employee_balance_summary(
    employee_id: int,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get leave balance summary for an employee."""
    # Employees can only view their own, admins can view any
    if current_user.role != 'admin' and current_user.employee:
        if current_user.employee.id != employee_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    target_year = year or date.today().year

    balances = db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == employee_id,
        LeaveBalance.year == target_year
    ).all()

    items = []
    total_entitled = Decimal("0")
    total_used = Decimal("0")

    for balance in balances:
        remaining = Decimal(str(balance.remaining_days))
        total_entitled += balance.entitled_days + balance.carried_over_days
        total_used += balance.used_days

        response = LeaveBalanceResponse(
            id=balance.id,
            employee_id=balance.employee_id,
            leave_type_id=balance.leave_type_id,
            year=balance.year,
            entitled_days=balance.entitled_days,
            used_days=balance.used_days,
            pending_days=balance.pending_days,
            carried_over_days=balance.carried_over_days,
            remaining_days=remaining,
            created_at=balance.created_at,
            updated_at=balance.updated_at
        )
        if balance.leave_type:
            response.leave_type_code = balance.leave_type.code
            response.leave_type_name = balance.leave_type.name
        items.append(response)

    return EmployeeLeaveBalanceSummary(
        employee_id=employee_id,
        year=target_year,
        balances=items,
        total_entitled=total_entitled,
        total_used=total_used,
        total_remaining=total_entitled - total_used
    )


# ================== Leave Request Endpoints ==================

@router.get("/requests", response_model=LeaveRequestListResponse)
async def list_leave_requests(
    employee_id: Optional[int] = None,
    leave_type_id: Optional[int] = None,
    status: Optional[LeaveStatus] = None,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List leave requests. Admins see all, employees see only their own."""
    query = db.query(LeaveRequest)

    # Filter by role
    if current_user.role != 'admin':
        if current_user.employee:
            query = query.filter(LeaveRequest.employee_id == current_user.employee.id)
        else:
            return LeaveRequestListResponse(items=[], total=0)

    if employee_id:
        query = query.filter(LeaveRequest.employee_id == employee_id)
    if leave_type_id:
        query = query.filter(LeaveRequest.leave_type_id == leave_type_id)
    if status:
        query = query.filter(LeaveRequest.status == status)
    if year:
        query = query.filter(func.extract('year', LeaveRequest.start_date) == year)

    requests = query.order_by(LeaveRequest.created_at.desc()).all()

    items = []
    for req in requests:
        response = LeaveRequestResponse(
            id=req.id,
            employee_id=req.employee_id,
            leave_type_id=req.leave_type_id,
            start_date=req.start_date,
            end_date=req.end_date,
            total_days=req.total_days,
            is_half_day=req.is_half_day,
            half_day_period=req.half_day_period,
            reason=req.reason,
            contact_number=req.contact_number,
            attachment_path=req.attachment_path,
            status=req.status,
            reviewed_by=req.reviewed_by,
            reviewed_at=req.reviewed_at,
            review_notes=req.review_notes,
            created_at=req.created_at,
            updated_at=req.updated_at
        )
        if req.employee:
            response.employee_name = f"{req.employee.first_name} {req.employee.last_name}"
            response.employee_no = req.employee.employee_no
        if req.leave_type:
            response.leave_type_code = req.leave_type.code
            response.leave_type_name = req.leave_type.name
        if req.reviewer:
            response.reviewer_name = f"{req.reviewer.first_name} {req.reviewer.last_name}"
        items.append(response)

    return LeaveRequestListResponse(items=items, total=len(items))


@router.get("/requests/{request_id}", response_model=LeaveRequestResponse)
async def get_leave_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific leave request."""
    req = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")

    # Check authorization
    if current_user.role != 'admin':
        if not current_user.employee or current_user.employee.id != req.employee_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    response = LeaveRequestResponse(
        id=req.id,
        employee_id=req.employee_id,
        leave_type_id=req.leave_type_id,
        start_date=req.start_date,
        end_date=req.end_date,
        total_days=req.total_days,
        is_half_day=req.is_half_day,
        half_day_period=req.half_day_period,
        reason=req.reason,
        contact_number=req.contact_number,
        attachment_path=req.attachment_path,
        status=req.status,
        reviewed_by=req.reviewed_by,
        reviewed_at=req.reviewed_at,
        review_notes=req.review_notes,
        created_at=req.created_at,
        updated_at=req.updated_at
    )
    if req.employee:
        response.employee_name = f"{req.employee.first_name} {req.employee.last_name}"
        response.employee_no = req.employee.employee_no
    if req.leave_type:
        response.leave_type_code = req.leave_type.code
        response.leave_type_name = req.leave_type.name
    if req.reviewer:
        response.reviewer_name = f"{req.reviewer.first_name} {req.reviewer.last_name}"

    return response


@router.post("/requests", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_leave_request(
    data: LeaveRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a leave request."""
    # Admins can create for any employee, employees only for themselves
    if current_user.role != 'admin':
        if not current_user.employee or current_user.employee.id != data.employee_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Verify employee and leave type
    employee = db.query(Employee).filter(Employee.id == data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    leave_type = db.query(LeaveTypeConfig).filter(LeaveTypeConfig.id == data.leave_type_id).first()
    if not leave_type:
        raise HTTPException(status_code=404, detail="Leave type not found")

    # Calculate total days
    if data.is_half_day:
        total_days = Decimal("0.5")
    else:
        total_days = count_working_days(data.start_date, data.end_date, db)

    if total_days <= 0:
        raise HTTPException(status_code=400, detail="No working days in selected range")

    # Check balance
    year = data.start_date.year
    balance = db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == data.employee_id,
        LeaveBalance.leave_type_id == data.leave_type_id,
        LeaveBalance.year == year
    ).first()

    if balance:
        remaining = Decimal(str(balance.remaining_days))
        if total_days > remaining:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient leave balance. Remaining: {remaining}, Requested: {total_days}"
            )

    # Check for overlapping requests
    overlapping = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == data.employee_id,
        LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
        LeaveRequest.start_date <= data.end_date,
        LeaveRequest.end_date >= data.start_date
    ).first()

    if overlapping:
        raise HTTPException(status_code=400, detail="Leave dates overlap with existing request")

    # Create request
    request = LeaveRequest(
        employee_id=data.employee_id,
        leave_type_id=data.leave_type_id,
        start_date=data.start_date,
        end_date=data.end_date,
        total_days=total_days,
        is_half_day=data.is_half_day,
        half_day_period=data.half_day_period,
        reason=data.reason,
        contact_number=data.contact_number,
        status=LeaveStatus.PENDING
    )
    db.add(request)

    # Update balance (add to pending)
    if balance:
        update_leave_balance_on_request(request, db, 'create')

    db.commit()
    db.refresh(request)

    response = LeaveRequestResponse(
        id=request.id,
        employee_id=request.employee_id,
        employee_name=f"{employee.first_name} {employee.last_name}",
        employee_no=employee.employee_no,
        leave_type_id=request.leave_type_id,
        leave_type_code=leave_type.code,
        leave_type_name=leave_type.name,
        start_date=request.start_date,
        end_date=request.end_date,
        total_days=request.total_days,
        is_half_day=request.is_half_day,
        half_day_period=request.half_day_period,
        reason=request.reason,
        contact_number=request.contact_number,
        attachment_path=request.attachment_path,
        status=request.status,
        reviewed_by=request.reviewed_by,
        reviewed_at=request.reviewed_at,
        review_notes=request.review_notes,
        created_at=request.created_at,
        updated_at=request.updated_at
    )
    return response


@router.post("/requests/{request_id}/approve", response_model=LeaveRequestResponse)
async def approve_leave_request(
    request_id: int,
    data: LeaveRequestApproval,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Approve or reject a leave request (Admin only)."""
    request = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if request.status != LeaveStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Request is already {request.status.value}")

    old_status = request.status
    request.status = data.status
    request.reviewed_by = current_admin.id
    request.reviewed_at = datetime.now()
    request.review_notes = data.review_notes

    # Update balance
    if data.status == LeaveStatus.APPROVED:
        update_leave_balance_on_request(request, db, 'approve')
    else:  # REJECTED
        update_leave_balance_on_request(request, db, 'reject')

    db.commit()
    db.refresh(request)

    # Send email notification
    if request.employee and request.employee.email:
        employee_name = f"{request.employee.first_name} {request.employee.last_name}"
        leave_type_name = request.leave_type.name if request.leave_type else "Leave"
        start_date_str = request.start_date.strftime("%B %d, %Y")
        end_date_str = request.end_date.strftime("%B %d, %Y")

        try:
            if data.status == LeaveStatus.APPROVED:
                email_service.send_leave_approved_notification(
                    to_email=request.employee.email,
                    employee_name=employee_name,
                    leave_type=leave_type_name,
                    start_date=start_date_str,
                    end_date=end_date_str,
                    total_days=float(request.total_days),
                    review_notes=data.review_notes
                )
            else:  # REJECTED
                email_service.send_leave_rejected_notification(
                    to_email=request.employee.email,
                    employee_name=employee_name,
                    leave_type=leave_type_name,
                    start_date=start_date_str,
                    end_date=end_date_str,
                    review_notes=data.review_notes
                )
            logger.info(f"Leave notification email sent to {request.employee.email}")
        except Exception as e:
            # Don't fail the request if email fails
            logger.error(f"Failed to send leave notification email: {e}")

    response = LeaveRequestResponse(
        id=request.id,
        employee_id=request.employee_id,
        leave_type_id=request.leave_type_id,
        start_date=request.start_date,
        end_date=request.end_date,
        total_days=request.total_days,
        is_half_day=request.is_half_day,
        half_day_period=request.half_day_period,
        reason=request.reason,
        contact_number=request.contact_number,
        attachment_path=request.attachment_path,
        status=request.status,
        reviewed_by=request.reviewed_by,
        reviewer_name=f"{current_admin.first_name} {current_admin.last_name}",
        reviewed_at=request.reviewed_at,
        review_notes=request.review_notes,
        created_at=request.created_at,
        updated_at=request.updated_at
    )
    if request.employee:
        response.employee_name = f"{request.employee.first_name} {request.employee.last_name}"
        response.employee_no = request.employee.employee_no
    if request.leave_type:
        response.leave_type_code = request.leave_type.code
        response.leave_type_name = request.leave_type.name

    return response


@router.post("/requests/{request_id}/cancel")
async def cancel_leave_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a leave request."""
    request = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found")

    # Check authorization
    if current_user.role != 'admin':
        if not current_user.employee or current_user.employee.id != request.employee_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    if request.status == LeaveStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Request is already cancelled")

    # Can only cancel pending or approved (before start date)
    if request.status == LeaveStatus.APPROVED and request.start_date <= date.today():
        raise HTTPException(status_code=400, detail="Cannot cancel leave that has already started")

    # Update balance
    update_leave_balance_on_request(request, db, 'cancel')

    request.status = LeaveStatus.CANCELLED
    db.commit()

    return {"message": "Leave request cancelled"}


@router.delete("/requests/{request_id}")
async def delete_leave_request(
    request_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a leave request (Admin only)."""
    request = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found")

    # Update balance if needed
    if request.status in [LeaveStatus.PENDING, LeaveStatus.APPROVED]:
        update_leave_balance_on_request(request, db, 'cancel')

    db.delete(request)
    db.commit()

    return {"message": "Leave request deleted"}
