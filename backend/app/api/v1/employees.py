"""
Employees API Endpoints
=======================
Employee management (Admin only for write operations).
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import cast, Integer
from typing import Optional

from app.api.deps import get_db, get_current_admin, get_current_user
from app.models.user import User, Role, UserStatus
from app.models.employee import Employee, Department
from app.schemas.employee import (
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    EmployeeListResponse, DepartmentCreate, DepartmentUpdate, DepartmentResponse
)

router = APIRouter()


# === Departments ===

@router.get("/departments", response_model=list[DepartmentResponse])
async def list_departments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all departments."""
    departments = db.query(Department).filter(Department.is_active == True).all()
    return [DepartmentResponse.model_validate(d) for d in departments]


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    dept_data: DepartmentCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new department (Admin only)."""
    # Check for duplicate code
    existing = db.query(Department).filter(Department.code == dept_data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Department code already exists")

    dept = Department(**dept_data.model_dump())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return DepartmentResponse.model_validate(dept)


@router.get("/departments/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get department by ID."""
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return DepartmentResponse.model_validate(dept)


@router.patch("/departments/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: int,
    dept_data: DepartmentUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update department (Admin only)."""
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Check for duplicate code if code is being changed
    update_data = dept_data.model_dump(exclude_unset=True)
    if 'code' in update_data and update_data['code'] != dept.code:
        existing = db.query(Department).filter(
            Department.code == update_data['code'],
            Department.id != department_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Department code already exists")

    for field, value in update_data.items():
        setattr(dept, field, value)

    db.commit()
    db.refresh(dept)
    return DepartmentResponse.model_validate(dept)


@router.delete("/departments/{department_id}")
async def delete_department(
    department_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete department (Admin only). Soft delete - sets is_active to False."""
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Check if any active employees are in this department
    active_employees = db.query(Employee).filter(
        Employee.department_id == department_id,
        Employee.is_active == True
    ).count()

    if active_employees > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department with {active_employees} active employee(s). Reassign them first."
        )

    dept.is_active = False
    db.commit()
    return {"message": "Department deleted"}


# === Employees ===

@router.get("/without-users")
async def list_employees_without_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List active employees who don't have user accounts yet.
    Useful for previewing before syncing.
    """
    # Get all active employees
    employees = db.query(Employee).filter(
        Employee.status == 'active',
        Employee.is_active == True
    ).all()

    # Check which ones don't have users
    without_users = []
    with_users = []

    for emp in employees:
        existing_user = db.query(User).filter(User.employee_id == emp.id).first()
        emp_data = {
            "id": emp.id,
            "employee_no": emp.employee_no,
            "full_name": emp.full_name,
            "email": emp.email,
            "status": emp.status
        }
        if existing_user:
            emp_data["user_email"] = existing_user.email
            with_users.append(emp_data)
        else:
            without_users.append(emp_data)

    return {
        "without_users": without_users,
        "with_users": with_users,
        "total_without": len(without_users),
        "total_with": len(with_users)
    }


@router.get("", response_model=EmployeeListResponse)
async def list_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    department_id: Optional[int] = None,
    is_active: Optional[bool] = True,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = Query(None, description="Field to sort by"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List employees.
    Employees can only see active employees.
    Admins can see all and filter by status (pending/active/inactive).
    """
    query = db.query(Employee)

    # Non-admin can only see active verified employees
    if current_user.role != Role.ADMIN:
        query = query.filter(
            Employee.is_active == True,
            Employee.status == 'active'
        )
    else:
        # Admin filters
        if is_active is not None:
            query = query.filter(Employee.is_active == is_active)
        if status:
            query = query.filter(Employee.status == status)

    if department_id:
        query = query.filter(Employee.department_id == department_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Employee.employee_no.ilike(search_term)) |
            (Employee.first_name.ilike(search_term)) |
            (Employee.last_name.ilike(search_term))
        )

    total = query.count()

    # Sorting - use numeric cast for ID fields
    sort_columns = {
        'employee_no': Employee.employee_no,
        'name': Employee.first_name,
        'first_name': Employee.first_name,
        'last_name': Employee.last_name,
        'department': Employee.department_id,
        'position': Employee.position,
        'status': Employee.status,
        'biometric_id': Employee.biometric_id,
    }

    # Fields that should be sorted numerically (biometric_id is just numbers)
    # employee_no has EMP prefix with leading zeros so text sort works fine
    numeric_sort_fields = ['biometric_id']

    sort_column = sort_columns.get(sort_by, Employee.last_name)

    # Cast to integer for numeric sorting
    if sort_by in numeric_sort_fields:
        sort_column = cast(sort_column, Integer)

    if sort_order == 'desc':
        sort_column = sort_column.desc()

    employees = query.order_by(sort_column).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return EmployeeListResponse(
        items=[EmployeeResponse.model_validate(e) for e in employees],
        total=total,
        page=page,
        page_size=page_size
    )


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    employee_data: EmployeeCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new employee (Admin only)."""
    # Check for duplicate employee_no
    existing = db.query(Employee).filter(Employee.employee_no == employee_data.employee_no).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee number already exists")

    employee = Employee(**employee_data.model_dump())
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return EmployeeResponse.model_validate(employee)


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get employee by ID."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Non-admin can only view their own employee record
    if current_user.role != Role.ADMIN:
        if current_user.employee_id != employee_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return EmployeeResponse.model_validate(employee)


@router.patch("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    employee_data: EmployeeUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update employee (Admin only)."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    update_data = employee_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(employee, field, value)

    db.commit()
    db.refresh(employee)
    return EmployeeResponse.model_validate(employee)


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Soft delete employee (Admin only)."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.is_active = False
    employee.status = 'inactive'
    db.commit()
    return {"message": "Employee deactivated"}


@router.post("/{employee_id}/verify")
async def verify_employee(
    employee_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Verify/activate a pending employee (Admin only).
    This changes their status from 'pending' to 'active'.
    """
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if employee.status == 'active':
        raise HTTPException(status_code=400, detail="Employee is already verified")

    employee.status = 'active'
    db.commit()

    return {"message": f"Employee {employee.full_name} has been verified and activated"}


@router.post("/verify-all")
async def verify_all_pending(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Verify all pending employees at once (Admin only)."""
    pending_employees = db.query(Employee).filter(
        Employee.status == 'pending'
    ).all()

    count = len(pending_employees)
    for emp in pending_employees:
        emp.status = 'active'

    db.commit()

    return {"message": f"Verified {count} employees"}


@router.post("/sync-users")
async def sync_employees_to_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Create user accounts for all active employees who don't have one.
    Uses temporary password: 1441@Ican
    Employees can only view their own data.
    """
    from app.core.security import hash_password

    TEMP_PASSWORD = "1441@Ican"

    # Get active employees without user accounts
    employees_without_users = db.query(Employee).filter(
        Employee.status == 'active',
        Employee.is_active == True
    ).all()

    created = 0
    skipped = 0
    errors = []

    for emp in employees_without_users:
        # Check if user already exists for this employee
        existing_user = db.query(User).filter(User.employee_id == emp.id).first()
        if existing_user:
            skipped += 1
            continue

        # Generate email from name if not set
        email = emp.email
        if not email:
            # Create email from name: firstname.lastname@company.local
            first = emp.first_name.lower().replace(' ', '')
            last = emp.last_name.lower().replace(' ', '') if emp.last_name else ''
            email = f"{first}.{last}@company.local" if last else f"{first}@company.local"

        # Check if email already exists
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            # Add employee ID to make unique
            email = f"{first}.{last}.{emp.id}@company.local"

        try:
            new_user = User(
                email=email,
                password_hash=hash_password(TEMP_PASSWORD),
                first_name=emp.first_name,
                last_name=emp.last_name or '',
                role=Role.EMPLOYEE,
                status=UserStatus.ACTIVE,
                employee_id=emp.id,
                must_change_password=True  # Force password change on first login
            )
            db.add(new_user)
            db.flush()
            created += 1
        except Exception as e:
            errors.append(f"{emp.full_name}: {str(e)}")

    db.commit()

    return {
        "message": f"Created {created} user accounts, skipped {skipped} (already exist)",
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "temp_password": TEMP_PASSWORD
    }
