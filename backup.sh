#!/bin/bash
# ============================================================
# ICAN Attendance & Payroll — 3-2-1 Backup Script
# ============================================================
# Copy 1: Live app (always running)
# Copy 2: /Volumes/Server1/backups/attendance-payroll/
# Copy 3: /Volumes/ICAN-MATERIALS/backups/attendance-payroll/
# Offsite: Already handled externally
#
# Runs daily via LaunchAgent. Keeps last 30 days of backups.
# Each backup is a timestamped zip of the database + code.
# ============================================================

set -euo pipefail

APP_DIR="/Users/icanacademy/attendance-payroll"
DB_FILE="$APP_DIR/backend/attendance_payroll.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATE_ONLY=$(date +"%Y%m%d")
BACKUP_NAME="ap_backup_${TIMESTAMP}"
TEMP_DIR="/tmp/${BACKUP_NAME}"
KEEP_DAYS=30

# Backup destinations (2 different storage media)
DEST1="/Volumes/Server1/backups/attendance-payroll"
DEST2="/Volumes/ICAN-MATERIALS/backups/attendance-payroll"

LOG="/tmp/payroll-backup.log"
echo "[$(date)] Starting 3-2-1 backup..." >> "$LOG"

# ---- Step 1: Create temp backup directory ----
mkdir -p "$TEMP_DIR"

# ---- Step 2: Safe copy of SQLite database (using sqlite3 .backup for consistency) ----
if [ -f "$DB_FILE" ]; then
    # Use SQLite online backup API to get a consistent snapshot
    if command -v sqlite3 &>/dev/null; then
        sqlite3 "$DB_FILE" ".backup '$TEMP_DIR/attendance_payroll.db'"
    else
        cp "$DB_FILE" "$TEMP_DIR/attendance_payroll.db"
    fi
    echo "[$(date)] Database backed up ($(du -sh "$TEMP_DIR/attendance_payroll.db" | cut -f1))" >> "$LOG"
else
    echo "[$(date)] WARNING: Database not found at $DB_FILE" >> "$LOG"
fi

# ---- Step 3: Back up backend code (excluding venv, __pycache__, .git) ----
rsync -a --exclude='venv' --exclude='__pycache__' --exclude='.git' --exclude='node_modules' --exclude='.next' \
    "$APP_DIR/backend/" "$TEMP_DIR/backend/" 2>/dev/null || true

# ---- Step 4: Back up frontend code (excluding node_modules) ----
rsync -a --exclude='node_modules' --exclude='.git' --exclude='.next' \
    "$APP_DIR/frontend/" "$TEMP_DIR/frontend/" 2>/dev/null || true

# ---- Step 5: Back up LaunchAgent plists ----
mkdir -p "$TEMP_DIR/launchagents"
cp /Users/icanacademy/Library/LaunchAgents/com.ican.attendance-payroll*.plist "$TEMP_DIR/launchagents/" 2>/dev/null || true

# ---- Step 6: Back up CLAUDE.md ----
cp "$APP_DIR/CLAUDE.md" "$TEMP_DIR/" 2>/dev/null || true

# ---- Step 7: Create zip ----
ZIP_FILE="/tmp/${BACKUP_NAME}.zip"
cd /tmp && zip -r -q "$ZIP_FILE" "$BACKUP_NAME"
ZIP_SIZE=$(du -sh "$ZIP_FILE" | cut -f1)
echo "[$(date)] Zip created: $ZIP_SIZE" >> "$LOG"

# ---- Step 8: Copy to Destination 1 (Server1) ----
DEST1_OK=false
if [ -d "$DEST1" ] || mkdir -p "$DEST1" 2>/dev/null; then
    cp "$ZIP_FILE" "$DEST1/" && DEST1_OK=true
    echo "[$(date)] Copied to Server1: $DEST1/${BACKUP_NAME}.zip" >> "$LOG"
else
    echo "[$(date)] ERROR: Server1 not available at $DEST1" >> "$LOG"
fi

# ---- Step 9: Copy to Destination 2 (ICAN-MATERIALS) ----
DEST2_OK=false
if [ -d "$DEST2" ] || mkdir -p "$DEST2" 2>/dev/null; then
    cp "$ZIP_FILE" "$DEST2/" && DEST2_OK=true
    echo "[$(date)] Copied to ICAN-MATERIALS: $DEST2/${BACKUP_NAME}.zip" >> "$LOG"
else
    echo "[$(date)] ERROR: ICAN-MATERIALS not available at $DEST2" >> "$LOG"
fi

# ---- Step 10: Cleanup old backups (keep last KEEP_DAYS days) ----
if $DEST1_OK; then
    find "$DEST1" -name "ap_backup_*.zip" -mtime +${KEEP_DAYS} -delete 2>/dev/null || true
    DEST1_COUNT=$(ls -1 "$DEST1"/ap_backup_*.zip 2>/dev/null | wc -l | tr -d ' ')
    echo "[$(date)] Server1: $DEST1_COUNT backups retained" >> "$LOG"
fi
if $DEST2_OK; then
    find "$DEST2" -name "ap_backup_*.zip" -mtime +${KEEP_DAYS} -delete 2>/dev/null || true
    DEST2_COUNT=$(ls -1 "$DEST2"/ap_backup_*.zip 2>/dev/null | wc -l | tr -d ' ')
    echo "[$(date)] ICAN-MATERIALS: $DEST2_COUNT backups retained" >> "$LOG"
fi

# ---- Step 11: Cleanup temp files ----
rm -rf "$TEMP_DIR" "$ZIP_FILE"

# ---- Summary ----
if $DEST1_OK && $DEST2_OK; then
    echo "[$(date)] BACKUP COMPLETE — 2 copies saved ($ZIP_SIZE each)" >> "$LOG"
elif $DEST1_OK || $DEST2_OK; then
    echo "[$(date)] PARTIAL BACKUP — only 1 destination available" >> "$LOG"
else
    echo "[$(date)] BACKUP FAILED — no destinations available" >> "$LOG"
fi

echo "---" >> "$LOG"
