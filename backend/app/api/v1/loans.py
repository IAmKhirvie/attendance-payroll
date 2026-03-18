"""
Loan API Endpoints
==================
CRUD operations for employee loans and loan types.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal

from app.api.deps import get_db, get_current_admin
from app.models.user import User
from app.models.employee import Employee
from app.models.loan import LoanTypeConfig, Loan, LoanDeduction, LoanStatus
from app.schemas.loan import (
    LoanTypeConfigCreate, LoanTypeConfigUpdate, LoanTypeConfigResponse, LoanTypeConfigListResponse,
    LoanCreate, LoanUpdate, LoanResponse, LoanListResponse, LoanSummary,
    LoanDeductionCreate, LoanDeductionResponse, LoanDeductionListResponse,
    AmortizationEntry, AmortizationSchedule
)

router = APIRouter()


# ================== Loan Type Config Endpoints ==================

@router.get("/types", response_model=LoanTypeConfigListResponse)
async def list_loan_types(
    include_inactive: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all loan types (Admin only)."""
    query = db.query(LoanTypeConfig)
    if not include_inactive:
        query = query.filter(LoanTypeConfig.is_active == True)

    loan_types = query.order_by(LoanTypeConfig.code).all()

    return LoanTypeConfigListResponse(
        items=[LoanTypeConfigResponse.model_validate(lt) for lt in loan_types],
        total=len(loan_types)
    )


@router.post("/types", response_model=LoanTypeConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_loan_type(
    data: LoanTypeConfigCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new loan type (Admin only)."""
    # Check for duplicate code
    existing = db.query(LoanTypeConfig).filter(LoanTypeConfig.code == data.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Loan type code '{data.code}' already exists")

    loan_type = LoanTypeConfig(
        code=data.code.upper(),
        name=data.name,
        description=data.description,
        default_interest_rate=data.default_interest_rate,
        is_active=data.is_active
    )
    db.add(loan_type)
    db.commit()
    db.refresh(loan_type)

    return LoanTypeConfigResponse.model_validate(loan_type)


@router.patch("/types/{type_id}", response_model=LoanTypeConfigResponse)
async def update_loan_type(
    type_id: int,
    data: LoanTypeConfigUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a loan type (Admin only)."""
    loan_type = db.query(LoanTypeConfig).filter(LoanTypeConfig.id == type_id).first()
    if not loan_type:
        raise HTTPException(status_code=404, detail="Loan type not found")

    update_dict = data.model_dump(exclude_unset=True)
    if 'code' in update_dict:
        update_dict['code'] = update_dict['code'].upper()

    for field, value in update_dict.items():
        setattr(loan_type, field, value)

    db.commit()
    db.refresh(loan_type)

    return LoanTypeConfigResponse.model_validate(loan_type)


@router.delete("/types/{type_id}")
async def delete_loan_type(
    type_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a loan type (Admin only). Deactivates if loans exist."""
    loan_type = db.query(LoanTypeConfig).filter(LoanTypeConfig.id == type_id).first()
    if not loan_type:
        raise HTTPException(status_code=404, detail="Loan type not found")

    # Check if any loans use this type
    loan_count = db.query(Loan).filter(Loan.loan_type_id == type_id).count()
    if loan_count > 0:
        # Soft delete - just deactivate
        loan_type.is_active = False
        db.commit()
        return {"message": f"Loan type deactivated (has {loan_count} associated loans)"}

    db.delete(loan_type)
    db.commit()
    return {"message": "Loan type deleted"}


@router.post("/types/seed")
async def seed_loan_types(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Seed default loan types (Admin only)."""
    default_types = [
        {"code": "COMPANY", "name": "Company Loan", "description": "Internal company loan", "rate": Decimal("0")},
        {"code": "SSS", "name": "SSS Salary Loan", "description": "SSS salary loan program", "rate": Decimal("10")},
        {"code": "SSS_CAL", "name": "SSS Calamity Loan", "description": "SSS calamity loan program", "rate": Decimal("10")},
        {"code": "PAGIBIG", "name": "Pag-IBIG Multi-Purpose Loan", "description": "Pag-IBIG MPL", "rate": Decimal("10.5")},
        {"code": "PAGIBIG_CAL", "name": "Pag-IBIG Calamity Loan", "description": "Pag-IBIG calamity loan", "rate": Decimal("5.95")},
        {"code": "CA", "name": "Cash Advance", "description": "Employee cash advance", "rate": Decimal("0")},
    ]

    seeded = 0
    for lt in default_types:
        existing = db.query(LoanTypeConfig).filter(LoanTypeConfig.code == lt["code"]).first()
        if not existing:
            loan_type = LoanTypeConfig(
                code=lt["code"],
                name=lt["name"],
                description=lt["description"],
                default_interest_rate=lt["rate"],
                is_active=True
            )
            db.add(loan_type)
            seeded += 1

    db.commit()
    return {"message": f"Seeded {seeded} loan types", "seeded": seeded}


# ================== Loan Endpoints ==================

@router.get("", response_model=LoanListResponse)
async def list_loans(
    employee_id: Optional[int] = None,
    loan_type_id: Optional[int] = None,
    status: Optional[LoanStatus] = None,
    include_paid: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all loans (Admin only). Filter by employee, type, or status."""
    query = db.query(Loan)

    if employee_id:
        query = query.filter(Loan.employee_id == employee_id)
    if loan_type_id:
        query = query.filter(Loan.loan_type_id == loan_type_id)
    if status:
        query = query.filter(Loan.status == status)
    if not include_paid:
        query = query.filter(Loan.status == LoanStatus.ACTIVE)

    loans = query.order_by(Loan.start_date.desc()).all()

    # Build response with employee and loan type info
    items = []
    for loan in loans:
        response = LoanResponse.model_validate(loan)
        if loan.employee:
            response.employee_name = f"{loan.employee.first_name} {loan.employee.last_name}"
            response.employee_no = loan.employee.employee_no
        if loan.loan_type_config:
            response.loan_type_code = loan.loan_type_config.code
            response.loan_type_name = loan.loan_type_config.name
        items.append(response)

    return LoanListResponse(items=items, total=len(items))


@router.get("/{loan_id}", response_model=LoanResponse)
async def get_loan(
    loan_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get a specific loan (Admin only)."""
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    response = LoanResponse.model_validate(loan)
    if loan.employee:
        response.employee_name = f"{loan.employee.first_name} {loan.employee.last_name}"
        response.employee_no = loan.employee.employee_no
    if loan.loan_type_config:
        response.loan_type_code = loan.loan_type_config.code
        response.loan_type_name = loan.loan_type_config.name

    return response


@router.post("", response_model=LoanResponse, status_code=status.HTTP_201_CREATED)
async def create_loan(
    data: LoanCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new loan (Admin only)."""
    # Validate employee
    employee = db.query(Employee).filter(Employee.id == data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Validate loan type
    loan_type = db.query(LoanTypeConfig).filter(LoanTypeConfig.id == data.loan_type_id).first()
    if not loan_type:
        raise HTTPException(status_code=404, detail="Loan type not found")

    # Calculate total amount (simple interest for now)
    interest_rate = data.interest_rate if data.interest_rate else loan_type.default_interest_rate
    interest_amount = data.principal_amount * (interest_rate / 100) * (data.term_months / 12)
    total_amount = data.principal_amount + interest_amount

    # Calculate end date if not provided
    end_date = data.end_date
    if not end_date:
        from dateutil.relativedelta import relativedelta
        end_date = data.start_date + relativedelta(months=data.term_months)

    loan = Loan(
        employee_id=data.employee_id,
        loan_type_id=data.loan_type_id,
        reference_no=data.reference_no,
        principal_amount=data.principal_amount,
        interest_rate=interest_rate,
        total_amount=total_amount,
        term_months=data.term_months,
        monthly_deduction=data.monthly_deduction,
        start_date=data.start_date,
        end_date=end_date,
        remaining_balance=total_amount,
        total_paid=Decimal("0"),
        status=LoanStatus.ACTIVE,
        notes=data.notes,
        created_by=current_admin.id
    )

    db.add(loan)
    db.commit()
    db.refresh(loan)

    response = LoanResponse.model_validate(loan)
    response.employee_name = f"{employee.first_name} {employee.last_name}"
    response.employee_no = employee.employee_no
    response.loan_type_code = loan_type.code
    response.loan_type_name = loan_type.name

    return response


@router.patch("/{loan_id}", response_model=LoanResponse)
async def update_loan(
    loan_id: int,
    data: LoanUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a loan (Admin only)."""
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    update_dict = data.model_dump(exclude_unset=True)

    # If marking as paid, set actual end date
    if 'status' in update_dict and update_dict['status'] == LoanStatus.PAID:
        loan.actual_end_date = date.today()

    for field, value in update_dict.items():
        setattr(loan, field, value)

    db.commit()
    db.refresh(loan)

    response = LoanResponse.model_validate(loan)
    if loan.employee:
        response.employee_name = f"{loan.employee.first_name} {loan.employee.last_name}"
        response.employee_no = loan.employee.employee_no
    if loan.loan_type_config:
        response.loan_type_code = loan.loan_type_config.code
        response.loan_type_name = loan.loan_type_config.name

    return response


@router.delete("/{loan_id}")
async def delete_loan(
    loan_id: int,
    permanent: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a loan (Admin only). Soft delete by default."""
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    if permanent:
        # Check for deductions
        deduction_count = db.query(LoanDeduction).filter(LoanDeduction.loan_id == loan_id).count()
        if deduction_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot permanently delete loan with {deduction_count} deduction records"
            )
        db.delete(loan)
    else:
        loan.status = LoanStatus.CANCELLED

    db.commit()
    return {"message": "Loan deleted" if permanent else "Loan cancelled"}


@router.get("/employee/{employee_id}/summary", response_model=LoanSummary)
async def get_employee_loan_summary(
    employee_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get loan summary for an employee (Admin only)."""
    # Verify employee exists
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get all loans for this employee
    loans = db.query(Loan).filter(Loan.employee_id == employee_id).all()
    active_loans = [l for l in loans if l.status == LoanStatus.ACTIVE]

    return LoanSummary(
        employee_id=employee_id,
        total_loans=len(loans),
        active_loans=len(active_loans),
        total_principal=sum(l.principal_amount for l in loans),
        total_remaining=sum(l.remaining_balance for l in active_loans),
        total_paid=sum(l.total_paid for l in loans),
        monthly_deductions=sum(l.monthly_deduction for l in active_loans)
    )


@router.get("/{loan_id}/amortization", response_model=AmortizationSchedule)
async def get_loan_amortization(
    loan_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get amortization schedule for a loan (Admin only)."""
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    from dateutil.relativedelta import relativedelta

    schedule = []
    balance = loan.total_amount
    current_date = loan.start_date

    for month in range(1, loan.term_months + 1):
        # Simple amortization (equal payments)
        payment = loan.monthly_deduction
        interest_portion = balance * (loan.interest_rate / 100 / 12) if loan.interest_rate > 0 else Decimal("0")
        principal_portion = payment - interest_portion

        if principal_portion > balance:
            principal_portion = balance
            payment = principal_portion + interest_portion

        balance = balance - principal_portion
        if balance < 0:
            balance = Decimal("0")

        schedule.append(AmortizationEntry(
            month=month,
            date=current_date,
            payment=payment,
            principal=principal_portion,
            interest=interest_portion,
            balance=balance
        ))

        current_date = current_date + relativedelta(months=1)

    return AmortizationSchedule(
        loan_id=loan.id,
        principal=loan.principal_amount,
        interest_rate=loan.interest_rate,
        total_amount=loan.total_amount,
        monthly_payment=loan.monthly_deduction,
        term_months=loan.term_months,
        schedule=schedule
    )


# ================== Loan Deduction Endpoints ==================

@router.get("/{loan_id}/deductions", response_model=LoanDeductionListResponse)
async def list_loan_deductions(
    loan_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all deductions for a loan (Admin only)."""
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    deductions = db.query(LoanDeduction).filter(
        LoanDeduction.loan_id == loan_id
    ).order_by(LoanDeduction.deduction_date.desc()).all()

    return LoanDeductionListResponse(
        items=[LoanDeductionResponse.model_validate(d) for d in deductions],
        total=len(deductions)
    )


@router.post("/{loan_id}/deductions", response_model=LoanDeductionResponse, status_code=status.HTTP_201_CREATED)
async def create_loan_deduction(
    loan_id: int,
    data: LoanDeductionCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a manual loan deduction (Admin only)."""
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    if loan.status != LoanStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Cannot add deduction to non-active loan")

    # Calculate balances
    balance_before = loan.remaining_balance
    amount = min(data.amount, balance_before)  # Don't over-deduct
    balance_after = balance_before - amount

    # Create deduction
    deduction = LoanDeduction(
        loan_id=loan_id,
        payslip_id=data.payslip_id,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        deduction_date=data.deduction_date,
        notes=data.notes
    )
    db.add(deduction)

    # Update loan
    loan.remaining_balance = balance_after
    loan.total_paid = loan.total_paid + amount

    # Check if fully paid
    if balance_after <= 0:
        loan.status = LoanStatus.PAID
        loan.actual_end_date = data.deduction_date

    db.commit()
    db.refresh(deduction)

    return LoanDeductionResponse.model_validate(deduction)


@router.delete("/{loan_id}/deductions/{deduction_id}")
async def delete_loan_deduction(
    loan_id: int,
    deduction_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a loan deduction and reverse the balance (Admin only)."""
    deduction = db.query(LoanDeduction).filter(
        LoanDeduction.id == deduction_id,
        LoanDeduction.loan_id == loan_id
    ).first()

    if not deduction:
        raise HTTPException(status_code=404, detail="Deduction not found")

    loan = deduction.loan

    # Reverse the deduction
    loan.remaining_balance = loan.remaining_balance + deduction.amount
    loan.total_paid = loan.total_paid - deduction.amount

    # Reactivate if was paid
    if loan.status == LoanStatus.PAID:
        loan.status = LoanStatus.ACTIVE
        loan.actual_end_date = None

    db.delete(deduction)
    db.commit()

    return {"message": "Deduction deleted and balance reversed"}


# ================== Payroll Integration ==================

@router.get("/employee/{employee_id}/active-deductions")
async def get_employee_active_deductions(
    employee_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all active loan deductions for an employee.
    Used by payroll calculator to apply loan deductions.
    """
    loans = db.query(Loan).filter(
        Loan.employee_id == employee_id,
        Loan.status == LoanStatus.ACTIVE
    ).all()

    deductions = []
    for loan in loans:
        deductions.append({
            "loan_id": loan.id,
            "loan_type": loan.loan_type_config.code if loan.loan_type_config else "UNKNOWN",
            "loan_type_name": loan.loan_type_config.name if loan.loan_type_config else "Unknown",
            "monthly_deduction": float(loan.monthly_deduction),
            "remaining_balance": float(loan.remaining_balance),
            "reference_no": loan.reference_no
        })

    return {
        "employee_id": employee_id,
        "total_monthly_deductions": sum(d["monthly_deduction"] for d in deductions),
        "deductions": deductions
    }
