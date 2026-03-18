#!/usr/bin/env python3
"""
Database Restore Script
=======================
Run this script to restore a database backup.

Usage:
    python scripts/restore.py --list                    # List available backups
    python scripts/restore.py --backup backup_xxx.db.gz # Restore specific backup
    python scripts/restore.py --latest                  # Restore latest backup
"""

import sys
import os
import argparse

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.backup_service import backup_service


def main():
    parser = argparse.ArgumentParser(description="Database Restore Utility")
    parser.add_argument("--list", action="store_true", help="List all backups")
    parser.add_argument("--backup", type=str, help="Backup filename to restore")
    parser.add_argument("--latest", action="store_true", help="Restore the latest backup")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")

    args = parser.parse_args()

    if args.list:
        print("\n=== Available Backups ===")
        backups = backup_service.list_backups()
        if not backups:
            print("No backups found.")
        else:
            for i, b in enumerate(backups):
                latest = " [LATEST]" if i == 0 else ""
                print(f"  {b['filename']:<40} {b['size_mb']:>8.2f} MB  {b['created_at']}{latest}")
            print(f"\nTotal: {len(backups)} backups")
        return

    # Determine which backup to restore
    backup_name = None

    if args.backup:
        backup_name = args.backup
    elif args.latest:
        backups = backup_service.list_backups()
        if not backups:
            print("No backups available to restore.")
            sys.exit(1)
        backup_name = backups[0]["filename"]
    else:
        parser.print_help()
        sys.exit(1)

    # Confirm restore
    if not args.yes:
        print(f"\nWARNING: This will replace the current database with backup: {backup_name}")
        print("A backup of the current database will be created before restore.")
        confirm = input("Are you sure you want to continue? (yes/no): ")
        if confirm.lower() != "yes":
            print("Restore cancelled.")
            sys.exit(0)

    # Restore backup
    print(f"\nRestoring database from: {backup_name}")
    try:
        result = backup_service.restore_backup(backup_name)
        print(f"  Database restored successfully!")
        print(f"  Pre-restore backup: {result['pre_restore_backup']}")
        print(f"  Restored at: {result['restored_at']}")
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error restoring backup: {e}")
        sys.exit(1)

    print("\nRestore complete. Please restart the server to apply changes.")


if __name__ == "__main__":
    main()
