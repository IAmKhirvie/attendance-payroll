#!/bin/bash
# =============================================================================
# Backup Scheduling Setup Script
# Attendance & Payroll System
# =============================================================================
# This script sets up automated backups using launchd (macOS) or cron (Linux)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_FILE="$SCRIPT_DIR/com.icanstudio.attendance-payroll.backup.plist"
LAUNCHD_DEST="$HOME/Library/LaunchAgents/com.icanstudio.attendance-payroll.backup.plist"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "=============================================="
echo "  Backup Scheduling Setup"
echo "=============================================="
echo ""

# Make backup script executable
log_info "Making backup script executable..."
chmod +x "$SCRIPT_DIR/backup-321.sh"
log_success "Backup script is now executable"

# Create logs directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Detect OS and set up appropriate scheduler
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - use launchd
    log_info "macOS detected - setting up launchd job..."
    
    # Update plist with correct paths
    log_info "Updating launchd plist with correct paths..."
    sed -i '' "s|/Users/icanstudio2/attendance-payroll|$SCRIPT_DIR|g" "$PLIST_FILE"
    sed -i '' "s|/Users/icanstudio2/attendance-payroll|$SCRIPT_DIR|g" "$LAUNCHD_DEST" 2>/dev/null || true
    
    # Copy plist to LaunchAgents
    mkdir -p "$HOME/Library/LaunchAgents"
    cp "$PLIST_FILE" "$LAUNCHD_DEST"
    
    # Load the job
    log_info "Loading launchd job..."
    launchctl unload "$LAUNCHD_DEST" 2>/dev/null || true
    launchctl load "$LAUNCHD_DEST"
    
    log_success "launchd job installed successfully!"
    log_info "Backup will run daily at 2:00 AM"
    
    # Verify job is loaded
    if launchctl list | grep -q "com.icanstudio.attendance-payroll.backup"; then
        log_success "Backup job is active and running"
    fi
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - use cron
    log_info "Linux detected - setting up cron job..."
    
    # Create cron entry
    CRON_ENTRY="0 2 * * * $SCRIPT_DIR/backup-321.sh >> $SCRIPT_DIR/logs/cron-backup.log 2>&1"
    
    # Check if cron entry already exists
    if crontab -l 2>/dev/null | grep -q "attendance-payroll.backup"; then
        log_warning "Backup cron job already exists"
    else
        # Add to crontab
        (crontab -l 2>/dev/null | grep -v "attendance-payroll.backup"; echo "$CRON_ENTRY") | crontab -
        log_success "Cron job installed successfully!"
        log_info "Backup will run daily at 2:00 AM"
    fi
else
    log_warning "Unknown OS - automatic scheduling not configured"
    log_info "You can manually run: $SCRIPT_DIR/backup-321.sh"
fi

echo ""
echo "=============================================="
echo "  Setup Complete!"
echo "=============================================="
echo ""
echo "  To run backup manually:"
echo "    $SCRIPT_DIR/backup-321.sh"
echo ""
echo "  To view backup logs:"
echo "    $SCRIPT_DIR/backups/logs/"
echo ""
echo "  To check launchd job status (macOS):"
echo "    launchctl list | grep attendance-payroll"
echo ""
echo "  To check cron jobs (Linux):"
echo "    crontab -l"
echo ""
echo "  To uninstall scheduled backups:"
echo "    $SCRIPT_DIR/setup-backup-schedule.sh uninstall"
echo ""
