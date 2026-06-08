#!/bin/bash
set -euo pipefail

APP_DIR="/Users/icanacademy/attendance-payroll/frontend"
LOG_PREFIX="[attendance-payroll-frontend]"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$APP_DIR"

if [ ! -x "$APP_DIR/node_modules/.bin/vite" ] || ! /opt/homebrew/bin/npx vite --version >/dev/null 2>&1; then
  echo "$LOG_PREFIX repairing frontend dependencies"
  npm install
fi

echo "$LOG_PREFIX starting vite on 0.0.0.0:4500"
exec /opt/homebrew/bin/npx vite --host 0.0.0.0 --port 4500
