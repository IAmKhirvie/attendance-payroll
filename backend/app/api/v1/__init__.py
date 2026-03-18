"""API v1 endpoints."""
from fastapi import APIRouter
from . import auth, users, employees, attendance, payroll, settings, holidays, loans, leave, reports, import_export, backups

api_router = APIRouter()

# Include all routers
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(employees.router, prefix="/employees", tags=["Employees"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
api_router.include_router(payroll.router, prefix="/payroll", tags=["Payroll"])
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"])
api_router.include_router(holidays.router, prefix="/holidays", tags=["Holidays"])
api_router.include_router(loans.router, prefix="/loans", tags=["Loans"])
api_router.include_router(leave.router, prefix="/leave", tags=["Leave"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(import_export.router, prefix="/import-export", tags=["Import/Export"])
api_router.include_router(backups.router, prefix="/backups", tags=["Backups"])
