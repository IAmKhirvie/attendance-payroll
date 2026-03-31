#!/bin/bash
# =============================================================================
# Backup Scheduling Uninstall Script
# Attendance & Payroll System
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHD_DEST="$HOME/Library/LaunchAgents/com.icanstudio.attendance-payroll.backup.plist"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

echo ""
echo "=============================================="
echo "  Removing Backup Schedule"
echo "=============================================="
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - remove launchd job
    log_info "Removing launchd job..."
    launchctl unload "$LAUNCHD_DEST" 2>/dev/null || true
    rm -f "$LAUNCHD_DEST"
    log_success "launchd job removed"
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - remove cron job
    log_info "Removing cron job..."
    crontab -l 2>/dev/null | grep -v "attendance-payroll.backup" | crontab -
    log_success "Cron job removed"
fi

echo ""
log_success "Backup schedule has been removed"
echo ""
