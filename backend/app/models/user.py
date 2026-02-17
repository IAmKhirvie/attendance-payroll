"""
User Model
==========
User accounts and roles for authentication.
Two roles only: ADMIN (HR) and EMPLOYEE.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class Role(str, enum.Enum):
    """User roles - simplified to 2 roles only."""
    ADMIN = "admin"      # HR/Admin - full access
    EMPLOYEE = "employee"  # Employee - self-service only


class UserStatus(str, enum.Enum):
    """User account status."""
    PENDING = "pending"    # Awaiting HR approval (self-registered)
    ACTIVE = "active"      # Active account
    INACTIVE = "inactive"  # Deactivated by HR
    LOCKED = "locked"      # Locked due to failed attempts


class User(Base):
    """User account model."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    # Authentication
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)

    # Profile
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)

    # Role & Status
    role = Column(SQLEnum(Role), default=Role.EMPLOYEE, nullable=False)
    status = Column(SQLEnum(UserStatus), default=UserStatus.PENDING, nullable=False)

    # Password management
    must_change_password = Column(Boolean, default=False)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)

    # Link to Employee (optional - user might not be an employee)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    employee = relationship("Employee", back_populates="user")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE

    def __repr__(self):
        return f"<User {self.email} ({self.role.value})>"
