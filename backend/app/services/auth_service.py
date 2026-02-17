"""
Authentication Service
======================
Business logic for authentication operations.
"""

from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.models.user import User, Role, UserStatus
from app.models.settings import SystemSettings
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    validate_password_policy
)
from app.core.config import settings


class AuthService:
    """Authentication service."""

    def __init__(self, db: Session):
        self.db = db

    def get_password_policy(self) -> dict:
        """Get current password policy from system settings."""
        sys_settings = self.db.query(SystemSettings).first()
        if sys_settings:
            return {
                "min_length": sys_settings.password_min_length,
                "require_uppercase": sys_settings.password_require_uppercase,
                "require_numbers": sys_settings.password_require_numbers,
                "require_special": sys_settings.password_require_special,
            }
        # Return defaults
        return {
            "min_length": settings.PASSWORD_MIN_LENGTH,
            "require_uppercase": settings.PASSWORD_REQUIRE_UPPERCASE,
            "require_numbers": settings.PASSWORD_REQUIRE_NUMBERS,
            "require_special": settings.PASSWORD_REQUIRE_SPECIAL,
        }

    def authenticate(self, email: str, password: str) -> Tuple[Optional[User], str]:
        """
        Authenticate user with email and password.
        Returns (user, error_message).
        """
        user = self.db.query(User).filter(User.email == email.lower()).first()

        if not user:
            return None, "Invalid email or password"

        # Check if account is locked
        if user.status == UserStatus.LOCKED:
            if user.locked_until and user.locked_until > datetime.utcnow():
                remaining = (user.locked_until - datetime.utcnow()).seconds // 60
                return None, f"Account is locked. Try again in {remaining} minutes."
            else:
                # Unlock if lockout period has passed
                user.status = UserStatus.ACTIVE
                user.failed_login_attempts = 0
                user.locked_until = None
                self.db.commit()

        # Check if account is pending approval
        if user.status == UserStatus.PENDING:
            return None, "Account is pending approval by HR"

        # Check if account is inactive
        if user.status == UserStatus.INACTIVE:
            return None, "Account has been deactivated"

        # Verify password
        if not verify_password(password, user.password_hash):
            # Increment failed attempts
            user.failed_login_attempts += 1

            # Get lockout settings
            sys_settings = self.db.query(SystemSettings).first()
            max_attempts = sys_settings.max_failed_login_attempts if sys_settings else 5
            lockout_minutes = sys_settings.lockout_duration_minutes if sys_settings else 15

            if user.failed_login_attempts >= max_attempts:
                user.status = UserStatus.LOCKED
                user.locked_until = datetime.utcnow() + timedelta(minutes=lockout_minutes)
                self.db.commit()
                return None, f"Account locked due to too many failed attempts. Try again in {lockout_minutes} minutes."

            self.db.commit()
            return None, "Invalid email or password"

        # Successful login - reset failed attempts
        user.failed_login_attempts = 0
        user.last_login_at = datetime.utcnow()
        self.db.commit()

        return user, ""

    def create_tokens(self, user: User) -> dict:
        """Create access and refresh tokens for user."""
        access_token = create_access_token(
            subject=user.email,
            user_id=user.id,
            role=user.role.value
        )
        refresh_token = create_refresh_token(
            subject=user.email,
            user_id=user.id
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }

    def register_user(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        employee_no: Optional[str] = None
    ) -> Tuple[Optional[User], str]:
        """
        Register a new user (self-registration).
        User will be in PENDING status until HR approval.
        Returns (user, error_message).
        """
        # Check if email already exists
        existing = self.db.query(User).filter(User.email == email.lower()).first()
        if existing:
            return None, "Email already registered"

        # Validate password
        policy = self.get_password_policy()
        is_valid, error = validate_password_policy(password, **policy)
        if not is_valid:
            return None, error

        # Check system settings for self-registration
        sys_settings = self.db.query(SystemSettings).first()
        if sys_settings and not sys_settings.allow_self_registration:
            return None, "Self-registration is disabled. Contact HR."

        # Create user
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            first_name=first_name,
            last_name=last_name,
            role=Role.EMPLOYEE,
            status=UserStatus.PENDING if (sys_settings and sys_settings.require_approval_for_registration) else UserStatus.ACTIVE
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        return user, ""

    def create_user_by_hr(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        role: Role = Role.EMPLOYEE,
        employee_id: Optional[int] = None,
        must_change_password: bool = True
    ) -> Tuple[Optional[User], str]:
        """
        Create a new user (by HR).
        User is immediately active.
        Returns (user, error_message).
        """
        # Check if email already exists
        existing = self.db.query(User).filter(User.email == email.lower()).first()
        if existing:
            return None, "Email already registered"

        # Validate password
        policy = self.get_password_policy()
        is_valid, error = validate_password_policy(password, **policy)
        if not is_valid:
            return None, error

        # Create user
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            first_name=first_name,
            last_name=last_name,
            role=role,
            status=UserStatus.ACTIVE,
            employee_id=employee_id,
            must_change_password=must_change_password
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        return user, ""

    def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str
    ) -> Tuple[bool, str]:
        """
        Change user password.
        Returns (success, error_message).
        """
        # Verify current password
        if not verify_password(current_password, user.password_hash):
            return False, "Current password is incorrect"

        # Validate new password
        policy = self.get_password_policy()
        is_valid, error = validate_password_policy(new_password, **policy)
        if not is_valid:
            return False, error

        # Update password
        user.password_hash = hash_password(new_password)
        user.password_changed_at = datetime.utcnow()
        user.must_change_password = False
        self.db.commit()

        return True, ""

    def approve_user(
        self,
        user_id: int,
        role: Role = Role.EMPLOYEE,
        employee_id: Optional[int] = None
    ) -> Tuple[Optional[User], str]:
        """
        Approve a pending user registration.
        Returns (user, error_message).
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return None, "User not found"

        if user.status != UserStatus.PENDING:
            return None, "User is not in pending status"

        user.status = UserStatus.ACTIVE
        user.role = role
        if employee_id:
            user.employee_id = employee_id

        self.db.commit()
        self.db.refresh(user)

        return user, ""

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        return self.db.query(User).filter(User.id == user_id).first()

    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        return self.db.query(User).filter(User.email == email.lower()).first()
