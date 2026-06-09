#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:4500/admin}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:8500/health}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-26}"
ALERT_LOG="$APP_DIR/logs/health-alerts.log"
BACKUP_CONFIG="$APP_DIR/backup.conf"

BACKUP_DIR="$APP_DIR/backups"
EXTERNAL_BACKUP_DIR=""
OFFSITE_BACKUP_DIR=""
CLOUD_BACKUP_ENABLED=false
STRICT_321=false

if [ -f "$BACKUP_CONFIG" ]; then
  # shellcheck disable=SC1090
  . "$BACKUP_CONFIG"
fi

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

resolve_path() {
  local path="$1"
  if [ -z "$path" ]; then
    return 0
  fi
  case "$path" in
    /*) printf '%s\n' "$path" ;;
    *) printf '%s\n' "$APP_DIR/${path#./}" ;;
  esac
}

mtime_seconds() {
  local path="$1"
  stat -f %m "$path" 2>/dev/null || stat -c %Y "$path"
}

assert_backup_fresh() {
  local label="$1"
  local location="$2"
  local pattern="${3:-backup_*}"

  if [ -z "$location" ]; then
    alert "$label backup location is not configured"
    exit 1
  fi

  if [ ! -d "$location" ]; then
    alert "$label backup location is not mounted: $location"
    exit 1
  fi

  if ! touch "$location/.health-write-test" 2>/dev/null; then
    alert "$label backup location is not writable: $location"
    exit 1
  fi
  rm -f "$location/.health-write-test"

  local latest_backup
  latest_backup=$(find "$location" -maxdepth 1 -name "$pattern" -print 2>/dev/null | sort | tail -1 || true)
  if [ -z "$latest_backup" ]; then
    alert "No $label backup found in $location"
    exit 1
  fi

  local backup_age_hours
  backup_age_hours=$(( ($(date +%s) - $(mtime_seconds "$latest_backup")) / 3600 ))
  if [ "$backup_age_hours" -gt "$MAX_BACKUP_AGE_HOURS" ]; then
    alert "Latest $label backup is ${backup_age_hours}h old: $latest_backup"
    exit 1
  fi
  ok "Latest $label backup is ${backup_age_hours}h old"
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

BACKUP_DIR="$(resolve_path "$BACKUP_DIR")"
assert_backup_fresh "local" "$BACKUP_DIR/local"

if [ "$STRICT_321" = "true" ]; then
  assert_backup_fresh "external" "$(resolve_path "$EXTERNAL_BACKUP_DIR")"
  if [ -n "$OFFSITE_BACKUP_DIR" ]; then
    assert_backup_fresh "offsite" "$(resolve_path "$OFFSITE_BACKUP_DIR")"
  elif [ "$CLOUD_BACKUP_ENABLED" = "true" ]; then
    assert_backup_fresh "cloud" "$BACKUP_DIR/cloud" "backup_*_full.tar.gz"
  else
    alert "STRICT_321=true but no offsite directory or cloud backup is configured"
    exit 1
  fi
else
  ok "STRICT_321 is not enabled; local backup freshness only"
fi

if {
  tail -200 /tmp/payroll-backend.log 2>/dev/null
  tail -200 "$APP_DIR/logs/app.log" 2>/dev/null
} | grep -E "Traceback|CRITICAL|Unhandled exception" >/dev/null; then
  alert "Recent backend log contains critical error markers"
  exit 1
fi
ok "No recent critical backend log markers"

ok "Production health check passed"
