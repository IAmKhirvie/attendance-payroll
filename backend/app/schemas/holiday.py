"""
Holiday Schemas
===============
Pydantic models for holiday API operations.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from app.models.holiday import HolidayType


class HolidayCreate(BaseModel):
    """Create holiday request."""
    date: date
    name: str = Field(..., min_length=1, max_length=100)
    holiday_type: HolidayType = HolidayType.REGULAR
    description: Optional[str] = None
    is_recurring: bool = False
    is_active: bool = True


class HolidayUpdate(BaseModel):
    """Update holiday request."""
    date: Optional[date] = None
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    holiday_type: Optional[HolidayType] = None
    description: Optional[str] = None
    is_recurring: Optional[bool] = None
    is_active: Optional[bool] = None


class HolidayResponse(BaseModel):
    """Holiday response."""
    id: int
    date: date
    name: str
    holiday_type: HolidayType
    description: Optional[str]
    year: int
    is_recurring: bool
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class HolidayListResponse(BaseModel):
    """List of holidays."""
    items: List[HolidayResponse]
    total: int
