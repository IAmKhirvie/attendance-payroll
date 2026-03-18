"""
Holiday API Endpoints
=====================
CRUD operations for Philippine holidays.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

from app.api.deps import get_db, get_current_admin
from app.models.user import User
from app.models.holiday import Holiday, HolidayType
from app.schemas.holiday import (
    HolidayCreate, HolidayUpdate, HolidayResponse, HolidayListResponse
)

router = APIRouter()


@router.get("", response_model=HolidayListResponse)
async def list_holidays(
    year: Optional[int] = None,
    holiday_type: Optional[HolidayType] = None,
    include_inactive: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all holidays (Admin only). Optionally filter by year and type."""
    query = db.query(Holiday)

    if year:
        query = query.filter(Holiday.year == year)
    if holiday_type:
        query = query.filter(Holiday.holiday_type == holiday_type)
    if not include_inactive:
        query = query.filter(Holiday.is_active == True)

    holidays = query.order_by(Holiday.date).all()

    return HolidayListResponse(
        items=[HolidayResponse.model_validate(h) for h in holidays],
        total=len(holidays)
    )


@router.get("/{holiday_id}", response_model=HolidayResponse)
async def get_holiday(
    holiday_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get a specific holiday (Admin only)."""
    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return HolidayResponse.model_validate(holiday)


@router.post("", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
async def create_holiday(
    holiday_data: HolidayCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new holiday (Admin only)."""
    # Check if holiday already exists for this date
    existing = db.query(Holiday).filter(Holiday.date == holiday_data.date).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A holiday already exists for {holiday_data.date}"
        )

    holiday = Holiday(
        date=holiday_data.date,
        name=holiday_data.name,
        holiday_type=holiday_data.holiday_type,
        description=holiday_data.description,
        year=holiday_data.date.year,
        is_recurring=holiday_data.is_recurring,
        is_active=holiday_data.is_active
    )
    db.add(holiday)
    db.commit()
    db.refresh(holiday)

    return HolidayResponse.model_validate(holiday)


@router.patch("/{holiday_id}", response_model=HolidayResponse)
async def update_holiday(
    holiday_id: int,
    update_data: HolidayUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a holiday (Admin only)."""
    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    update_dict = update_data.model_dump(exclude_unset=True)

    # If date is being updated, also update year
    if 'date' in update_dict and update_dict['date']:
        update_dict['year'] = update_dict['date'].year

    for field, value in update_dict.items():
        setattr(holiday, field, value)

    db.commit()
    db.refresh(holiday)

    return HolidayResponse.model_validate(holiday)


@router.delete("/{holiday_id}")
async def delete_holiday(
    holiday_id: int,
    permanent: bool = False,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a holiday (Admin only). Soft delete by default."""
    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    if permanent:
        db.delete(holiday)
    else:
        holiday.is_active = False

    db.commit()

    return {"message": "Holiday deleted" if permanent else "Holiday deactivated"}


@router.post("/seed")
async def seed_holidays(
    year: int = Query(default=2025, ge=2020, le=2100),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Seed Philippine holidays for a specific year (Admin only)."""
    # Check existing holidays for the year
    existing_count = db.query(Holiday).filter(Holiday.year == year).count()
    if existing_count > 0:
        return {
            "message": f"Holidays for {year} already exist ({existing_count} holidays)",
            "seeded": 0
        }

    # Philippine Holidays
    holidays_data = [
        # Regular Holidays
        {"date": f"{year}-01-01", "name": "New Year's Day", "type": HolidayType.REGULAR},
        {"date": f"{year}-04-09", "name": "Araw ng Kagitingan (Day of Valor)", "type": HolidayType.REGULAR},
        {"date": f"{year}-05-01", "name": "Labor Day", "type": HolidayType.REGULAR},
        {"date": f"{year}-06-12", "name": "Independence Day", "type": HolidayType.REGULAR},
        {"date": f"{year}-11-30", "name": "Bonifacio Day", "type": HolidayType.REGULAR},
        {"date": f"{year}-12-25", "name": "Christmas Day", "type": HolidayType.REGULAR},
        {"date": f"{year}-12-30", "name": "Rizal Day", "type": HolidayType.REGULAR},

        # Special Non-Working Holidays
        {"date": f"{year}-02-25", "name": "EDSA People Power Revolution Anniversary", "type": HolidayType.SPECIAL},
        {"date": f"{year}-08-21", "name": "Ninoy Aquino Day", "type": HolidayType.SPECIAL},
        {"date": f"{year}-11-01", "name": "All Saints' Day", "type": HolidayType.SPECIAL},
        {"date": f"{year}-11-02", "name": "All Souls' Day", "type": HolidayType.SPECIAL},
        {"date": f"{year}-12-08", "name": "Feast of the Immaculate Conception", "type": HolidayType.SPECIAL},
        {"date": f"{year}-12-24", "name": "Christmas Eve", "type": HolidayType.SPECIAL},
        {"date": f"{year}-12-31", "name": "Last Day of the Year", "type": HolidayType.SPECIAL},
    ]

    # Add movable holidays based on year
    if year == 2025:
        # 2025 movable holidays
        holidays_data.extend([
            {"date": "2025-01-29", "name": "Chinese New Year", "type": HolidayType.SPECIAL},
            {"date": "2025-04-17", "name": "Maundy Thursday", "type": HolidayType.REGULAR},
            {"date": "2025-04-18", "name": "Good Friday", "type": HolidayType.REGULAR},
            {"date": "2025-04-19", "name": "Black Saturday", "type": HolidayType.SPECIAL},
            {"date": "2025-03-30", "name": "Eid'l Fitr (Feast of Ramadhan)", "type": HolidayType.REGULAR},
            {"date": "2025-06-06", "name": "Eid'l Adha (Feast of Sacrifice)", "type": HolidayType.REGULAR},
            {"date": "2025-08-25", "name": "National Heroes Day", "type": HolidayType.REGULAR},
        ])
    elif year == 2026:
        # 2026 movable holidays (estimated)
        holidays_data.extend([
            {"date": "2026-02-17", "name": "Chinese New Year", "type": HolidayType.SPECIAL},
            {"date": "2026-04-02", "name": "Maundy Thursday", "type": HolidayType.REGULAR},
            {"date": "2026-04-03", "name": "Good Friday", "type": HolidayType.REGULAR},
            {"date": "2026-04-04", "name": "Black Saturday", "type": HolidayType.SPECIAL},
            {"date": "2026-03-20", "name": "Eid'l Fitr (Feast of Ramadhan)", "type": HolidayType.REGULAR},
            {"date": "2026-05-27", "name": "Eid'l Adha (Feast of Sacrifice)", "type": HolidayType.REGULAR},
            {"date": "2026-08-31", "name": "National Heroes Day", "type": HolidayType.REGULAR},
        ])

    seeded = 0
    for h in holidays_data:
        try:
            holiday = Holiday(
                date=date.fromisoformat(h["date"]),
                name=h["name"],
                holiday_type=h["type"],
                year=year,
                is_recurring=False,  # Movable holidays need annual updates
                is_active=True
            )
            db.add(holiday)
            seeded += 1
        except Exception as e:
            print(f"Error seeding holiday {h['name']}: {e}")
            continue

    db.commit()

    return {
        "message": f"Seeded {seeded} holidays for {year}",
        "seeded": seeded,
        "year": year
    }


@router.get("/check/{check_date}")
async def check_holiday(
    check_date: date,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Check if a specific date is a holiday."""
    holiday = db.query(Holiday).filter(
        Holiday.date == check_date,
        Holiday.is_active == True
    ).first()

    if holiday:
        return {
            "is_holiday": True,
            "holiday": HolidayResponse.model_validate(holiday)
        }

    return {
        "is_holiday": False,
        "date": check_date
    }
