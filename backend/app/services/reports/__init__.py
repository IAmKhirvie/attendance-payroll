"""
Report Services
===============
Report generators for payroll, attendance, and government compliance forms.
"""

from .base import BaseReportGenerator
from .monthly_summary import MonthlyPayrollSummary
from .attendance_report import AttendanceReport
from .sss_r3 import SSSR3Report
from .philhealth_rf1 import PhilHealthRF1Report
from .pagibig_mcr import PagIBIGMCRReport

__all__ = [
    'BaseReportGenerator',
    'MonthlyPayrollSummary',
    'AttendanceReport',
    'SSSR3Report',
    'PhilHealthRF1Report',
    'PagIBIGMCRReport',
]
