#!/usr/bin/env python3
"""
Database Backup Script
======================
Run this script to create a database backup.
Can be scheduled via cron or launchd.

Usage:
    python scripts/backup.py                # Create backup
    python scripts/backup.py --cleanup      # Create backup and cleanup old ones
    python scripts/backup.py --list         # List all backups
"""

import sys
import os
import argparse

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.backup_service import backup_service


def main():
    parser = argparse.ArgumentParser(description="Database Backup Utility")
    parser.add_argument("--cleanup", action="store_true", help="Cleanup old backups after creating new one")
    parser.add_argument("--list", action="store_true", help="List all backups")
    parser.add_argument("--no-compress", action="store_true", help="Don't compress the backup")
    parser.add_argument("--retention-days", type=int, default=30, help="Days to keep backups (default: 30)")

    args = parser.parse_args()

    if args.list:
        print("\n=== Available Backups ===")
        backups = backup_service.list_backups()
        if not backups:
            print("No backups found.")
        else:
            for b in backups:
                print(f"  {b['filename']:<40} {b['size_mb']:>8.2f} MB  {b['created_at']}")
            print(f"\nTotal: {len(backups)} backups")
        return

    # Create backup
    print("Creating database backup...")
    try:
        result = backup_service.create_backup(compress=not args.no_compress)
        print(f"  Backup created: {result['filename']}")
        print(f"  Size: {result['size_mb']} MB")
        print(f"  Path: {result['path']}")
    except Exception as e:
        print(f"Error creating backup: {e}")
        sys.exit(1)

    # Cleanup if requested
    if args.cleanup:
        print(f"\nCleaning up backups older than {args.retention_days} days...")
        cleanup_result = backup_service.cleanup_old_backups(args.retention_days)
        print(f"  Deleted {cleanup_result['deleted_count']} old backup(s)")
        if cleanup_result['deleted_files']:
            for f in cleanup_result['deleted_files']:
                print(f"    - {f}")

    # Show status
    status = backup_service.get_backup_status()
    print(f"\nBackup Status:")
    print(f"  Total backups: {status['total_backups']}")
    print(f"  Total size: {status['total_size_mb']} MB")
    print(f"  Backup directory: {status['backup_directory']}")


if __name__ == "__main__":
    main()
