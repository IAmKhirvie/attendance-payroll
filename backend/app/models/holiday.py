"""
Holiday Model
=============
Philippine holidays for attendance and payroll calculations.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text, Enum as SQLEnum
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class HolidayType(str, enum.Enum):
    """Types of Philippine holidays."""
    REGULAR = "regular"  # Regular holiday (100% premium)
    SPECIAL = "special"  # Special Non-Working Holiday (30% premium)
    SPECIAL_WORKING = "special_working"  # Special Working Holiday


class Holiday(Base):
    """Holiday model for Philippine holidays."""
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)

    # Holiday info
    date = Column(Date, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    holiday_type = Column(SQLEnum(HolidayType), default=HolidayType.REGULAR)
    description = Column(Text, nullable=True)

    # Year (extracted for easier querying)
    year = Column(Integer, nullable=False, index=True)

    # Recurring - if True, this holiday repeats every year on the same date
    # For movable holidays (like Easter), set to False and create new entries each year
    is_recurring = Column(Boolean, default=False)

    # Status
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<Holiday {self.date}: {self.name} ({self.holiday_type.value})>"
