"""
Backup API Endpoints
====================
API endpoints for database backup management.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from app.api.deps import get_current_admin
from app.models.user import User
from app.services.backup_service import backup_service

router = APIRouter()


@router.get("/status")
async def get_backup_status(
    current_admin: User = Depends(get_current_admin)
):
    """Get backup status information (Admin only)."""
    return backup_service.get_backup_status()


@router.get("/list")
async def list_backups(
    current_admin: User = Depends(get_current_admin)
):
    """List all available backups (Admin only)."""
    return {"backups": backup_service.list_backups()}


@router.post("/create")
async def create_backup(
    compress: bool = True,
    current_admin: User = Depends(get_current_admin)
):
    """Create a new database backup (Admin only)."""
    try:
        result = backup_service.create_backup(compress=compress)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")


@router.post("/restore/{backup_name}")
async def restore_backup(
    backup_name: str,
    current_admin: User = Depends(get_current_admin)
):
    """
    Restore database from a backup (Admin only).

    WARNING: This will replace the current database!
    A backup of the current database is created before restore.
    """
    try:
        result = backup_service.restore_backup(backup_name)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")


@router.delete("/{backup_name}")
async def delete_backup(
    backup_name: str,
    current_admin: User = Depends(get_current_admin)
):
    """Delete a specific backup (Admin only)."""
    try:
        result = backup_service.delete_backup(backup_name)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/cleanup")
async def cleanup_old_backups(
    retention_days: int = 30,
    current_admin: User = Depends(get_current_admin)
):
    """
    Delete backups older than retention period (Admin only).

    Args:
        retention_days: Number of days to keep backups (default: 30)
    """
    if retention_days < 1:
        raise HTTPException(status_code=400, detail="Retention days must be at least 1")

    result = backup_service.cleanup_old_backups(retention_days)
    return result


@router.get("/download/{backup_name}")
async def download_backup(
    backup_name: str,
    current_admin: User = Depends(get_current_admin)
):
    """
    Download a backup file (Admin only).

    Use this to save backups to external media for the 3-2-1 strategy.
    """
    from fastapi.responses import FileResponse
    backup_path = backup_service.backup_dir / backup_name

    if not backup_path.exists():
        raise HTTPException(status_code=404, detail=f"Backup file not found: {backup_name}")

    return FileResponse(
        path=backup_path,
        filename=backup_name,
        media_type='application/octet-stream'
    )
