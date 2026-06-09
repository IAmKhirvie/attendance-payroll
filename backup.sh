#!/bin/bash
# Scheduled backup entrypoint.
# The LaunchAgent calls this file; keep the implementation in backup-321.sh.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$APP_DIR/backup-321.sh"
