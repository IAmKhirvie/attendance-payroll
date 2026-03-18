"""
Input Validators
================
Custom validators for input validation and sanitization.
"""

import re
from datetime import date, datetime
from typing import Optional
from decimal import Decimal, InvalidOperation


class ValidationError(Exception):
    """Custom validation error."""
    pass


# ================== Date Validators ==================

def validate_date_range(start_date: date, end_date: date, field_name: str = "date range") -> None:
    """Validate that start_date is before or equal to end_date."""
    if start_date > end_date:
        raise ValidationError(f"Invalid {field_name}: start date ({start_date}) must be before or equal to end date ({end_date})")


def validate_date_not_future(d: date, field_name: str = "date") -> None:
    """Validate that date is not in the future."""
    if d > date.today():
        raise ValidationError(f"Invalid {field_name}: cannot be a future date")


def validate_date_not_past(d: date, field_name: str = "date") -> None:
    """Validate that date is not in the past."""
    if d < date.today():
        raise ValidationError(f"Invalid {field_name}: cannot be a past date")


# ================== Number Validators ==================

def validate_positive_number(value: float, field_name: str = "value") -> None:
    """Validate that a number is positive."""
    if value <= 0:
        raise ValidationError(f"Invalid {field_name}: must be a positive number")


def validate_non_negative(value: float, field_name: str = "value") -> None:
    """Validate that a number is non-negative (zero or positive)."""
    if value < 0:
        raise ValidationError(f"Invalid {field_name}: cannot be negative")


def validate_percentage(value: float, field_name: str = "percentage") -> None:
    """Validate that a value is a valid percentage (0-100)."""
    if value < 0 or value > 100:
        raise ValidationError(f"Invalid {field_name}: must be between 0 and 100")


def validate_salary(value: float, min_wage: float = 0, max_salary: float = 10000000) -> None:
    """Validate salary is within reasonable bounds."""
    if value < min_wage:
        raise ValidationError(f"Invalid salary: cannot be less than minimum wage ({min_wage})")
    if value > max_salary:
        raise ValidationError(f"Invalid salary: exceeds maximum allowed ({max_salary})")


def parse_decimal(value: str, field_name: str = "value") -> Decimal:
    """Parse and validate a decimal value from string."""
    try:
        # Remove commas and whitespace
        cleaned = value.replace(",", "").strip()
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        raise ValidationError(f"Invalid {field_name}: '{value}' is not a valid number")


# ================== String Validators ==================

def validate_employee_no(emp_no: str) -> str:
    """
    Validate and normalize employee number format.
    Expected formats: EMP-001, EMP001, 001, etc.
    """
    if not emp_no or not emp_no.strip():
        raise ValidationError("Employee number is required")

    # Normalize: uppercase and strip
    normalized = emp_no.strip().upper()

    # Must be alphanumeric with optional dashes
    if not re.match(r'^[A-Z0-9\-]+$', normalized):
        raise ValidationError(f"Invalid employee number format: '{emp_no}'. Use only letters, numbers, and dashes.")

    if len(normalized) < 2 or len(normalized) > 20:
        raise ValidationError("Employee number must be 2-20 characters")

    return normalized


def validate_email(email: str) -> str:
    """Validate email format."""
    if not email or not email.strip():
        raise ValidationError("Email is required")

    email = email.strip().lower()

    # Basic email regex
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        raise ValidationError(f"Invalid email format: '{email}'")

    return email


def validate_phone(phone: str) -> str:
    """Validate Philippine phone number format."""
    if not phone:
        return phone

    # Remove common formatting
    cleaned = re.sub(r'[\s\-\(\)\+]', '', phone.strip())

    # Philippine mobile: 09XXXXXXXXX or +639XXXXXXXXX
    # Philippine landline: 02XXXXXXXX, etc.
    if cleaned.startswith('63'):
        cleaned = '0' + cleaned[2:]  # Convert +63 to 0

    if not re.match(r'^0\d{9,10}$', cleaned):
        raise ValidationError(f"Invalid phone number: '{phone}'. Expected format: 09XXXXXXXXX")

    return cleaned


def validate_sss_no(sss_no: str) -> str:
    """Validate SSS number format (XX-XXXXXXX-X)."""
    if not sss_no:
        return sss_no

    # Remove dashes for validation
    cleaned = sss_no.replace('-', '').strip()

    if not re.match(r'^\d{10}$', cleaned):
        raise ValidationError(f"Invalid SSS number: '{sss_no}'. Expected format: XX-XXXXXXX-X")

    # Format with dashes
    return f"{cleaned[:2]}-{cleaned[2:9]}-{cleaned[9]}"


def validate_philhealth_no(ph_no: str) -> str:
    """Validate PhilHealth number format (XX-XXXXXXXXX-X)."""
    if not ph_no:
        return ph_no

    cleaned = ph_no.replace('-', '').strip()

    if not re.match(r'^\d{12}$', cleaned):
        raise ValidationError(f"Invalid PhilHealth number: '{ph_no}'. Expected format: XX-XXXXXXXXX-X")

    return f"{cleaned[:2]}-{cleaned[2:11]}-{cleaned[11]}"


def validate_pagibig_no(pagibig_no: str) -> str:
    """Validate Pag-IBIG MID number format (XXXX-XXXX-XXXX)."""
    if not pagibig_no:
        return pagibig_no

    cleaned = pagibig_no.replace('-', '').strip()

    if not re.match(r'^\d{12}$', cleaned):
        raise ValidationError(f"Invalid Pag-IBIG MID number: '{pagibig_no}'. Expected format: XXXX-XXXX-XXXX")

    return f"{cleaned[:4]}-{cleaned[4:8]}-{cleaned[8:12]}"


def validate_tin(tin: str) -> str:
    """Validate TIN format (XXX-XXX-XXX-XXX)."""
    if not tin:
        return tin

    cleaned = tin.replace('-', '').strip()

    if not re.match(r'^\d{9,12}$', cleaned):
        raise ValidationError(f"Invalid TIN: '{tin}'. Expected format: XXX-XXX-XXX or XXX-XXX-XXX-XXX")

    # Format with dashes
    if len(cleaned) == 9:
        return f"{cleaned[:3]}-{cleaned[3:6]}-{cleaned[6:9]}"
    else:
        return f"{cleaned[:3]}-{cleaned[3:6]}-{cleaned[6:9]}-{cleaned[9:]}"


# ================== Password Validators ==================

def validate_password_strength(
    password: str,
    min_length: int = 6,
    require_uppercase: bool = False,
    require_lowercase: bool = False,
    require_numbers: bool = False,
    require_special: bool = False
) -> None:
    """
    Validate password meets complexity requirements.

    Args:
        password: Password to validate
        min_length: Minimum password length
        require_uppercase: Require at least one uppercase letter
        require_lowercase: Require at least one lowercase letter
        require_numbers: Require at least one number
        require_special: Require at least one special character
    """
    errors = []

    if len(password) < min_length:
        errors.append(f"Password must be at least {min_length} characters")

    if require_uppercase and not re.search(r'[A-Z]', password):
        errors.append("Password must contain at least one uppercase letter")

    if require_lowercase and not re.search(r'[a-z]', password):
        errors.append("Password must contain at least one lowercase letter")

    if require_numbers and not re.search(r'\d', password):
        errors.append("Password must contain at least one number")

    if require_special and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        errors.append("Password must contain at least one special character")

    if errors:
        raise ValidationError("; ".join(errors))


# ================== Business Logic Validators ==================

def validate_leave_days(
    requested_days: float,
    available_days: float,
    leave_type: str = "leave"
) -> None:
    """Validate leave request doesn't exceed available balance."""
    if requested_days > available_days:
        raise ValidationError(
            f"Insufficient {leave_type} balance. Requested: {requested_days}, Available: {available_days}"
        )


def validate_loan_amount(
    principal: float,
    max_amount: float = 1000000,
    min_amount: float = 1000
) -> None:
    """Validate loan amount is within acceptable range."""
    if principal < min_amount:
        raise ValidationError(f"Loan amount must be at least PHP {min_amount:,.2f}")
    if principal > max_amount:
        raise ValidationError(f"Loan amount cannot exceed PHP {max_amount:,.2f}")


def validate_no_overlapping_dates(
    new_start: date,
    new_end: date,
    existing_periods: list,
    entity_name: str = "period"
) -> None:
    """
    Validate that a new date range doesn't overlap with existing periods.

    Args:
        new_start: Start date of new period
        new_end: End date of new period
        existing_periods: List of tuples (start_date, end_date)
        entity_name: Name of entity for error message
    """
    for existing_start, existing_end in existing_periods:
        # Check for overlap
        if new_start <= existing_end and new_end >= existing_start:
            raise ValidationError(
                f"Overlapping {entity_name}: {new_start} to {new_end} conflicts with "
                f"existing period {existing_start} to {existing_end}"
            )
