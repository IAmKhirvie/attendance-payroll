"""
User Schemas
============
Pydantic models for user-related API operations.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from app.models.user import Role, UserStatus


# === Authentication ===

class UserLogin(BaseModel):
    """Login request schema."""
    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """Token response after successful login."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: "UserResponse"


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    """Change password request."""
    current_password: str
    new_password: str = Field(..., min_length=1)


# === Registration ===

class RegisterRequest(BaseModel):
    """Self-registration request (requires HR approval)."""
    email: EmailStr
    password: str = Field(..., min_length=1)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    employee_no: Optional[str] = None  # Optional - HR can assign later


# === User CRUD ===

class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)


class UserCreate(UserBase):
    """Create user request (by HR)."""
    password: str = Field(..., min_length=1)
    role: Role = Role.EMPLOYEE
    employee_id: Optional[int] = None
    must_change_password: bool = True  # Force password change on first login


class UserUpdate(BaseModel):
    """Update user request."""
    email: Optional[EmailStr] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[Role] = None
    status: Optional[UserStatus] = None
    employee_id: Optional[int] = None


class UserResponse(BaseModel):
    """User response schema."""
    id: int
    email: str
    first_name: str
    last_name: str
    full_name: str
    role: Role
    status: UserStatus
    employee_id: Optional[int]
    must_change_password: bool
    last_login_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Paginated user list response."""
    items: list[UserResponse]
    total: int
    page: int
    page_size: int


# === Approval ===

class ApproveUserRequest(BaseModel):
    """Approve pending user registration."""
    role: Role = Role.EMPLOYEE
    employee_id: Optional[int] = None


# Update forward reference
TokenResponse.model_rebuild()
