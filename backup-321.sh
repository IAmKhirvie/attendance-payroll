#!/bin/bash
# =============================================================================
# 3-2-1 Backup Script for Attendance & Payroll System
# =============================================================================
# 3 copies: 1 primary + 2 backups
# 2 media:  Local disk + External/Cloud storage
# 1 offsite: Cloud backup (GitHub/Remote)
# =============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_CONFIG="$SCRIPT_DIR/backup.conf"

# Load configuration or use defaults
if [ -f "$BACKUP_CONFIG" ]; then
    source "$BACKUP_CONFIG"
fi

# Default configuration (can be overridden in backup.conf)
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
EXTERNAL_BACKUP_DIR="${EXTERNAL_BACKUP_DIR:-}"
CLOUD_BACKUP_ENABLED="${CLOUD_BACKUP_ENABLED:-false}"
GITHUB_BACKUP_REPO="${GITHUB_BACKUP_REPO:-}"
DATABASE_PATH="${DATABASE_PATH:-$SCRIPT_DIR/backend/app/attendance_payroll.db}"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/backend/.env}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
RETENTION_LOCAL="${RETENTION_LOCAL:-7}"
COMPRESSION_LEVEL="${COMPRESSION_LEVEL:-6}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="backup_${TIMESTAMP}"

# =============================================================================
# Utility Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Backup Functions
# =============================================================================

create_backup_directory() {
    log_info "Creating backup directories..."
    mkdir -p "$BACKUP_DIR/local"
    mkdir -p "$BACKUP_DIR/external"
    mkdir -p "$BACKUP_DIR/cloud"
    mkdir -p "$BACKUP_DIR/logs"
}

backup_database() {
    local db_file="$1"
    local output_file="$2"
    
    if [ ! -f "$db_file" ]; then
        log_warning "Database file not found: $db_file"
        return 1
    fi
    
    log_info "Backing up database..."
    gzip -c -$COMPRESSION_LEVEL "$db_file" > "$output_file"
    log_success "Database backed up: $output_file"
}

backup_env_file() {
    local env_file="$1"
    local output_file="$2"
    
    if [ ! -f "$env_file" ]; then
        log_warning ".env file not found: $env_file (using .env.example)"
        if [ -f "${env_file}.example" ]; then
            env_file="${env_file}.example"
        else
            return 1
        fi
    fi
    
    log_info "Backing up environment configuration..."
    cp "$env_file" "$output_file"
    log_success "Environment config backed up: $output_file"
}

backup_application_data() {
    local output_dir="$1"
    
    log_info "Backing up application data..."
    
    # Backup important directories (excluding venv, __pycache__, etc.)
    if [ -d "$SCRIPT_DIR/backend/app" ]; then
        tar -czf "$output_dir/app_source_${TIMESTAMP}.tar.gz" \
            --exclude='__pycache__' \
            --exclude='*.pyc' \
            -C "$SCRIPT_DIR/backend" app
        log_success "Application source backed up"
    fi
    
    # Backup frontend if exists
    if [ -d "$SCRIPT_DIR/frontend" ]; then
        tar -czf "$output_dir/frontend_${TIMESTAMP}.tar.gz" \
            --exclude='node_modules' \
            --exclude='.next' \
            --exclude='build' \
            -C "$SCRIPT_DIR" frontend
        log_success "Frontend backed up"
    fi
    
    # Backup migrations
    if [ -d "$SCRIPT_DIR/backend/migrations" ]; then
        tar -czf "$output_dir/migrations_${TIMESTAMP}.tar.gz" \
            -C "$SCRIPT_DIR/backend" migrations
        log_success "Database migrations backed up"
    fi
}

create_full_backup() {
    local backup_location="$1"
    local backup_path="$backup_location/$BACKUP_NAME"
    
    log_info "Creating full backup at: $backup_path"
    mkdir -p "$backup_path"
    
    # Backup database
    if [ -f "$DATABASE_PATH" ]; then
        backup_database "$DATABASE_PATH" "$backup_path/database_${TIMESTAMP}.db.gz"
    fi
    
    # Backup environment
    backup_env_file "$ENV_FILE" "$backup_path/env_${TIMESTAMP}.conf"
    
    # Backup application data
    backup_application_data "$backup_path"
    
    # Create manifest
    create_manifest "$backup_path"
    
    log_success "Full backup created at: $backup_path"
}

create_manifest() {
    local backup_path="$1"
    local manifest_file="$backup_path/MANIFEST.txt"
    
    cat > "$manifest_file" << EOF
================================================================================
ATTENDANCE & PAYROLL SYSTEM - BACKUP MANIFEST
================================================================================
Backup Name: $BACKUP_NAME
Created: $(date)
Hostname: $(hostname)
User: $(whoami)
================================================================================

FILES INCLUDED:
$(ls -la "$backup_path" | tail -n +2)

================================================================================
BACKUP CHECKSUMS (SHA256):
EOF
    
    # Generate checksums for all files
    find "$backup_path" -type f -name "*.gz" -o -name "*.tar.gz" -o -name "*.conf" | while read file; do
        sha256sum "$file" >> "$manifest_file"
    done
    
    echo "" >> "$manifest_file"
    echo "================================================================================" >> "$manifest_file"
    echo "END OF MANIFEST" >> "$manifest_file"
    echo "================================================================================" >> "$manifest_file"
}

# =============================================================================
# 3-2-1 Backup Strategy Implementation
# =============================================================================

copy_1_primary() {
    # Primary backup location (local backups folder)
    log_info "=== COPY 1: Primary Local Backup ==="
    create_full_backup "$BACKUP_DIR/local"
}

copy_2_external() {
    # Secondary backup (external drive or different partition)
    log_info "=== COPY 2: External/Secondary Backup ==="
    
    if [ -n "$EXTERNAL_BACKUP_DIR" ] && [ -d "$EXTERNAL_BACKUP_DIR" ]; then
        create_full_backup "$EXTERNAL_BACKUP_DIR"
        log_success "External backup completed"
    else
        # If no external drive configured, create in separate local location
        log_warning "No external backup directory configured"
        log_info "Creating secondary backup in local external folder..."
        create_full_backup "$BACKUP_DIR/external"
        log_success "Secondary local backup completed (configure EXTERNAL_BACKUP_DIR for true external backup)"
    fi
}

copy_3_offsite() {
    # Offsite backup (cloud/GitHub)
    log_info "=== COPY 3: Offsite/Cloud Backup ==="
    
    if [ "$CLOUD_BACKUP_ENABLED" = "true" ]; then
        # Create compressed archive for cloud upload
        local cloud_archive="$BACKUP_DIR/cloud/${BACKUP_NAME}_full.tar.gz"
        
        log_info "Creating cloud backup archive..."
        tar -czf "$cloud_archive" -C "$BACKUP_DIR/local" "$BACKUP_NAME"
        
        log_success "Cloud backup archive created: $cloud_archive"
        
        # Upload to GitHub if configured
        if [ -n "$GITHUB_BACKUP_REPO" ]; then
            log_info "Uploading to GitHub backup repository..."
            upload_to_github "$cloud_archive"
        fi
        
        # Upload to cloud storage if configured (e.g., rclone, aws s3, etc.)
        if command -v rclone &> /dev/null && [ -n "$RCLONE_REMOTE" ]; then
            log_info "Uploading to cloud storage via rclone..."
            rclone copy "$cloud_archive" "$RCLONE_REMOTE:$RCLONE_BUCKET/attendance-payroll/"
            log_success "Cloud storage upload completed"
        fi
    else
        log_warning "Cloud backup disabled. Set CLOUD_BACKUP_ENABLED=true in backup.conf"
    fi
}

upload_to_github() {
    local archive="$1"
    
    # Check if git-lfs is available for large files
    if [ -d "$SCRIPT_DIR/.git" ]; then
        local backup_branch="backups"
        local current_branch=$(git rev-parse --abbrev-ref HEAD)
        
        # Create backup commit
        cd "$SCRIPT_DIR"
        
        # Store in backups folder and commit
        cp "$archive" "$BACKUP_DIR/"
        git add "$BACKUP_DIR/$(basename "$archive")" 2>/dev/null || true
        git commit -m "Backup: $BACKUP_NAME" 2>/dev/null || true
        
        log_info "Backup committed to local git (push to remote manually or configure auto-push)"
    fi
}

# =============================================================================
# Cleanup and Retention
# =============================================================================

cleanup_old_backups() {
    log_info "Cleaning up old backups (retention: $RETENTION_LOCAL days for local, $RETENTION_DAYS days for others)..."
    
    # Clean local backups (keep recent ones)
    find "$BACKUP_DIR/local" -type d -name "backup_*" -mtime +$RETENTION_LOCAL -exec rm -rf {} \; 2>/dev/null || true
    
    # Clean external backups
    find "$BACKUP_DIR/external" -type d -name "backup_*" -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null || true
    
    # Clean cloud backups
    find "$BACKUP_DIR/cloud" -type f -name "*.tar.gz" -mtime +$RETENTION_DAYS -exec rm -f {} \; 2>/dev/null || true
    
    log_success "Cleanup completed"
}

verify_backup() {
    local backup_path="$1"
    
    log_info "Verifying backup integrity..."
    
    # Check if manifest exists
    if [ -f "$backup_path/MANIFEST.txt" ]; then
        log_success "Manifest found"
    else
        log_error "Manifest missing!"
        return 1
    fi
    
    # Verify checksums
    local checksum_file="$backup_path/checksums.sha256"
    if [ -f "$checksum_file" ]; then
        cd "$backup_path"
        if sha256sum -c "$checksum_file" --quiet 2>/dev/null; then
            log_success "All checksums verified"
        else
            log_warning "Some checksums failed verification"
        fi
    fi
    
    # Check file sizes
    local total_size=$(du -sh "$backup_path" | cut -f1)
    log_info "Backup size: $total_size"
    
    return 0
}

# =============================================================================
# Logging
# =============================================================================

log_backup_run() {
    local status="$1"
    local log_file="$BACKUP_DIR/logs/backup_${TIMESTAMP}.log"
    
    {
        echo "=========================================="
        echo "Backup Run: $TIMESTAMP"
        echo "Status: $status"
        echo "Location: $BACKUP_DIR"
        echo "=========================================="
    } >> "$log_file"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo "  3-2-1 Backup System"
    echo "  Attendance & Payroll Application"
    echo "=============================================="
    echo ""
    
    local start_time=$(date +%s)
    
    # Create directories
    create_backup_directory
    
    # Execute 3-2-1 backup strategy
    copy_1_primary      # Copy 1: Local primary
    copy_2_external     # Copy 2: External/secondary
    copy_3_offsite      # Copy 3: Offsite/cloud
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Verify latest backup
    verify_backup "$BACKUP_DIR/local/$BACKUP_NAME"
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    log_success "Backup completed successfully in ${duration} seconds"
    log_info "Backup location: $BACKUP_DIR/local/$BACKUP_NAME"
    echo ""
    
    log_backup_run "SUCCESS"
    
    # Print summary
    echo "=============================================="
    echo "  BACKUP SUMMARY"
    echo "=============================================="
    echo "  Backup Name: $BACKUP_NAME"
    echo "  Primary:     $BACKUP_DIR/local/$BACKUP_NAME"
    if [ -n "$EXTERNAL_BACKUP_DIR" ]; then
        echo "  External:    $EXTERNAL_BACKUP_DIR/$BACKUP_NAME"
    else
        echo "  External:    $BACKUP_DIR/external/$BACKUP_NAME (local fallback)"
    fi
    if [ "$CLOUD_BACKUP_ENABLED" = "true" ]; then
        echo "  Cloud:       $BACKUP_DIR/cloud/${BACKUP_NAME}_full.tar.gz"
    else
        echo "  Cloud:       Disabled"
    fi
    echo "=============================================="
    echo ""
}

# Run main function
main "$@"
