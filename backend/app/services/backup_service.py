"""
Backup Service
==============
Database backup and restore functionality.
"""

import os
import shutil
import gzip
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Default backup directory
DEFAULT_BACKUP_DIR = Path(__file__).parent.parent.parent.parent / "backups"
RETENTION_DAYS = 30


class BackupService:
    """Service for database backup and restore."""

    def __init__(self, backup_dir: Optional[Path] = None):
        self.backup_dir = Path(backup_dir) if backup_dir else DEFAULT_BACKUP_DIR
        self.backup_dir.mkdir(parents=True, exist_ok=True)

        # Get database path from settings
        db_url = settings.DATABASE_URL
        if db_url.startswith("sqlite:///"):
            self.db_path = Path(db_url.replace("sqlite:///", ""))
        else:
            self.db_path = Path("attendance_payroll.db")

    def create_backup(self, compress: bool = True) -> Dict[str, Any]:
        """
        Create a backup of the database.

        Args:
            compress: Whether to compress the backup with gzip

        Returns:
            Dictionary with backup details
        """
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database file not found: {self.db_path}")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"backup_{timestamp}.db"

        if compress:
            backup_name += ".gz"
            backup_path = self.backup_dir / backup_name

            # Create compressed backup
            with open(self.db_path, 'rb') as f_in:
                with gzip.open(backup_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
        else:
            backup_path = self.backup_dir / backup_name
            shutil.copy2(self.db_path, backup_path)

        file_size = backup_path.stat().st_size

        logger.info(f"Backup created: {backup_path} ({file_size} bytes)")

        return {
            "filename": backup_name,
            "path": str(backup_path),
            "size": file_size,
            "size_mb": round(file_size / (1024 * 1024), 2),
            "created_at": datetime.now().isoformat(),
            "compressed": compress,
        }

    def restore_backup(self, backup_name: str) -> Dict[str, Any]:
        """
        Restore database from a backup.

        Args:
            backup_name: Name of the backup file to restore

        Returns:
            Dictionary with restore details
        """
        backup_path = self.backup_dir / backup_name

        if not backup_path.exists():
            raise FileNotFoundError(f"Backup file not found: {backup_path}")

        # Create a backup of current database before restore
        current_backup = self.create_backup(compress=True)
        current_backup["type"] = "pre_restore_backup"

        # Restore the backup
        if backup_name.endswith('.gz'):
            with gzip.open(backup_path, 'rb') as f_in:
                with open(self.db_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
        else:
            shutil.copy2(backup_path, self.db_path)

        logger.info(f"Database restored from: {backup_path}")

        return {
            "restored_from": backup_name,
            "restored_at": datetime.now().isoformat(),
            "pre_restore_backup": current_backup["filename"],
        }

    def list_backups(self) -> List[Dict[str, Any]]:
        """
        List all available backups.

        Returns:
            List of backup details
        """
        backups = []

        for file in sorted(self.backup_dir.glob("backup_*.db*"), reverse=True):
            stat = file.stat()
            backups.append({
                "filename": file.name,
                "size": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "compressed": file.name.endswith('.gz'),
            })

        return backups

    def delete_backup(self, backup_name: str) -> Dict[str, Any]:
        """
        Delete a specific backup.

        Args:
            backup_name: Name of the backup file to delete

        Returns:
            Dictionary with deletion details
        """
        backup_path = self.backup_dir / backup_name

        if not backup_path.exists():
            raise FileNotFoundError(f"Backup file not found: {backup_path}")

        backup_path.unlink()
        logger.info(f"Backup deleted: {backup_path}")

        return {
            "deleted": backup_name,
            "deleted_at": datetime.now().isoformat(),
        }

    def cleanup_old_backups(self, retention_days: int = RETENTION_DAYS) -> Dict[str, Any]:
        """
        Delete backups older than retention period.

        Args:
            retention_days: Number of days to keep backups

        Returns:
            Dictionary with cleanup details
        """
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        deleted = []

        for file in self.backup_dir.glob("backup_*.db*"):
            stat = file.stat()
            file_date = datetime.fromtimestamp(stat.st_mtime)

            if file_date < cutoff_date:
                file.unlink()
                deleted.append(file.name)
                logger.info(f"Deleted old backup: {file.name}")

        return {
            "deleted_count": len(deleted),
            "deleted_files": deleted,
            "retention_days": retention_days,
            "cutoff_date": cutoff_date.isoformat(),
        }

    def get_backup_status(self) -> Dict[str, Any]:
        """
        Get backup status information.

        Returns:
            Dictionary with backup status
        """
        backups = self.list_backups()

        total_size = sum(b["size"] for b in backups)
        latest = backups[0] if backups else None

        return {
            "backup_directory": str(self.backup_dir),
            "database_path": str(self.db_path),
            "total_backups": len(backups),
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "latest_backup": latest,
            "retention_days": RETENTION_DAYS,
        }


# Singleton instance
backup_service = BackupService()
