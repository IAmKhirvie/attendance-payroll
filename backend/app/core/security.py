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


def validate_password_policy(
    password: str,
    min_length: int = None,
    require_uppercase: bool = None,
    require_numbers: bool = None,
    require_special: bool = None
) -> tuple[bool, str]:
    """
    Validate password against policy.
    Returns (is_valid, error_message).
    """
    # Use defaults from settings if not provided
    min_len = min_length if min_length is not None else settings.PASSWORD_MIN_LENGTH
    req_upper = require_uppercase if require_uppercase is not None else settings.PASSWORD_REQUIRE_UPPERCASE
    req_num = require_numbers if require_numbers is not None else settings.PASSWORD_REQUIRE_NUMBERS
    req_special = require_special if require_special is not None else settings.PASSWORD_REQUIRE_SPECIAL

    if len(password) < min_len:
        return False, f"Password must be at least {min_len} characters"

    if req_upper and not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"

    if req_num and not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"

    if req_special and not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        return False, "Password must contain at least one special character"

    return True, ""
