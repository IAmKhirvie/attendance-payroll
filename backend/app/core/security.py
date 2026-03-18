"""
Security Module
===============
Password hashing, JWT token management, and security utilities.
"""

from datetime import datetime, timedelta
from typing import Optional, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from .config import settings

# Password hashing context (bcrypt)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str,
    user_id: int,
    role: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": subject,  # email
        "user_id": user_id,
        "role": role,
        "exp": expire,
        "type": "access"
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: str,
    user_id: int,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT refresh token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = {
        "sub": subject,
        "user_id": user_id,
        "exp": expire,
        "type": "refresh"
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# Common weak passwords to reject
COMMON_PASSWORDS = {
    "password", "123456", "12345678", "qwerty", "abc123", "monkey",
    "1234567", "letmein", "trustno1", "dragon", "baseball", "iloveyou",
    "master", "sunshine", "ashley", "bailey", "shadow", "123123",
    "654321", "superman", "qazwsx", "michael", "football", "password1",
    "password123", "welcome", "admin", "login", "p@ssw0rd", "passw0rd",
    "pass123", "admin123", "root", "toor", "user", "test", "guest"
}


def validate_password_policy(
    password: str,
    min_length: int = None,
    require_uppercase: bool = None,
    require_lowercase: bool = None,
    require_numbers: bool = None,
    require_special: bool = None,
    check_common: bool = True
) -> tuple[bool, str]:
    """
    Validate password against policy.
    Returns (is_valid, error_message).

    Args:
        password: Password to validate
        min_length: Minimum password length
        require_uppercase: Require at least one uppercase letter
        require_lowercase: Require at least one lowercase letter
        require_numbers: Require at least one digit
        require_special: Require at least one special character
        check_common: Check against common password list
    """
    # Use defaults from settings if not provided
    min_len = min_length if min_length is not None else settings.PASSWORD_MIN_LENGTH
    req_upper = require_uppercase if require_uppercase is not None else settings.PASSWORD_REQUIRE_UPPERCASE
    req_lower = require_lowercase if require_lowercase is not None else False
    req_num = require_numbers if require_numbers is not None else settings.PASSWORD_REQUIRE_NUMBERS
    req_special = require_special if require_special is not None else settings.PASSWORD_REQUIRE_SPECIAL

    # Check length
    if len(password) < min_len:
        return False, f"Password must be at least {min_len} characters"

    # Check for common passwords
    if check_common and password.lower() in COMMON_PASSWORDS:
        return False, "Password is too common. Please choose a stronger password."

    # Check uppercase requirement
    if req_upper and not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"

    # Check lowercase requirement
    if req_lower and not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"

    # Check number requirement
    if req_num and not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"

    # Check special character requirement
    if req_special and not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?/~`" for c in password):
        return False, "Password must contain at least one special character"

    return True, ""


def get_password_strength(password: str) -> dict:
    """
    Calculate password strength score.
    Returns dict with score (0-100) and feedback.
    """
    score = 0
    feedback = []

    # Length contribution (up to 30 points)
    length = len(password)
    if length >= 8:
        score += 10
    if length >= 12:
        score += 10
    if length >= 16:
        score += 10

    # Character variety (up to 40 points)
    has_lower = any(c.islower() for c in password)
    has_upper = any(c.isupper() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?/~`" for c in password)

    if has_lower:
        score += 10
    else:
        feedback.append("Add lowercase letters")

    if has_upper:
        score += 10
    else:
        feedback.append("Add uppercase letters")

    if has_digit:
        score += 10
    else:
        feedback.append("Add numbers")

    if has_special:
        score += 10
    else:
        feedback.append("Add special characters")

    # Uniqueness (up to 30 points)
    unique_chars = len(set(password))
    if unique_chars >= 6:
        score += 10
    if unique_chars >= 10:
        score += 10
    if unique_chars >= 14:
        score += 10

    # Penalize common passwords
    if password.lower() in COMMON_PASSWORDS:
        score = min(score, 20)
        feedback.append("Avoid common passwords")

    # Determine strength level
    if score >= 80:
        strength = "strong"
    elif score >= 60:
        strength = "good"
    elif score >= 40:
        strength = "fair"
    else:
        strength = "weak"

    return {
        "score": score,
        "strength": strength,
        "feedback": feedback
    }
