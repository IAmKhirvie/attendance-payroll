"""
Notion Integration API
======================
Sync employee data from Notion (READ-ONLY).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.api.deps import get_db, get_current_admin
from app.models.user import User
from app.services.notion_sync import sync_notion_to_employees, preview_notion_sync

router = APIRouter()


class NotionSyncRequest(BaseModel):
    """Request body for Notion sync."""
    api_key: str


class NotionPreviewRequest(BaseModel):
    """Request body for Notion sync preview."""
    api_key: str


@router.post("/preview")
async def preview_sync(
    request: NotionPreviewRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Preview what would be synced from Notion without making changes.
    Shows which employees would be matched and what would change.
    """
    try:
        results = preview_notion_sync(request.api_key, db)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
async def sync_from_notion(
    request: NotionSyncRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Sync employee data from Notion Teacher's Database.

    This is READ-ONLY from Notion's perspective:
    - Fetches teacher data from Notion
    - Updates matching employees in A&P
    - Does NOT write anything to Notion
    - Auto-recalculates late minutes after schedule updates

    Matching logic:
    1. Match by email (exact)
    2. Match by name (first + last)
    3. Match by Teacher ID in employee_no

    Updates:
    - Status (Active/Inactive/Break → active/inactive)
    - Schedule (Start Time/End Time → call_time/time_out)
    - Contact info (if empty in A&P)
    - Position
    """
    try:
        results = sync_notion_to_employees(
            db=db,
            api_key=request.api_key,
            admin_user_id=current_admin.id,
            admin_email=current_admin.email
        )

        # Auto-recalculate late minutes if any schedules were updated
        schedule_changed = False
        for detail in results.get("details", []):
            if detail.get("action") == "updated":
                changes = detail.get("changes", {})
                if "call_time" in changes or "time_out" in changes:
                    schedule_changed = True
                    break

        if schedule_changed:
            from app.services.attendance_recalc import recalculate_all_late_minutes
            recalc_result = recalculate_all_late_minutes(db)
            results["late_recalculation"] = recalc_result

        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
