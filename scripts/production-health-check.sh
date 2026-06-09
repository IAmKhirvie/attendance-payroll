#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:4500/admin}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:8500/health}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-26}"
ALERT_LOG="$APP_DIR/logs/health-alerts.log"

mkdir -p "$APP_DIR/logs"

alert() {
  local message="$1"
  echo "$(date '+%Y-%m-%d %H:%M:%S') ALERT $message" | tee -a "$ALERT_LOG"
}

ok() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') OK $1"
}

check_url() {
  local method="$1"
  local url="$2"
  local attempt

  for attempt in {1..5}; do
    if [ "$method" = "HEAD" ]; then
      curl -fsSI "$url" >/dev/null && return 0
    else
      curl -fsS "$url" >/dev/null && return 0
    fi
    sleep 2
  done

  return 1
}

if ! check_url GET "$BACKEND_HEALTH_URL"; then
  alert "Backend health check failed: $BACKEND_HEALTH_URL"
  exit 1
fi
ok "Backend health endpoint reachable"

if ! check_url HEAD "$FRONTEND_URL"; then
  alert "Frontend check failed: $FRONTEND_URL"
  exit 1
fi
ok "Frontend endpoint reachable"

latest_backup=$(find "$APP_DIR/backups/local" -type d -name 'backup_*' -print 2>/dev/null | sort | tail -1 || true)
if [ -z "$latest_backup" ]; then
  alert "No local 3-2-1 backup found"
  exit 1
fi

backup_age_hours=$(( ($(date +%s) - $(stat -f %m "$latest_backup")) / 3600 ))
if [ "$backup_age_hours" -gt "$MAX_BACKUP_AGE_HOURS" ]; then
  alert "Latest local backup is ${backup_age_hours}h old: $latest_backup"
  exit 1
fi
ok "Latest local backup is ${backup_age_hours}h old"

if tail -200 /tmp/payroll-backend.log 2>/dev/null | grep -E "Traceback|CRITICAL|Unhandled exception" >/dev/null; then
  alert "Recent backend log contains critical error markers"
  exit 1
fi
ok "No recent critical backend log markers"

ok "Production health check passed"
