# Attendance Payroll Production Security Runbook

Version baseline: v1.1
Last updated: 2026-06-09

## Current Deployment Target

The current system is a single-machine deployment:

- Frontend: `http://192.168.68.106:4500`
- Backend: `http://192.168.68.106:8500`
- Database: SQLite at `backend/attendance_payroll.db`
- Process manager: macOS LaunchAgents

This is manageable for a small internal admin system. Do not expose port `4500` or `8500` directly to the public internet.

## Secure Home Access

Recommended access pattern:

1. Put the app behind a private tunnel or VPN.
2. Require identity at the tunnel/VPN layer before the app is reachable.
3. Keep backend port `8500` private. Expose only the frontend/tunnel hostname.
4. Set `CORS_ORIGINS` to the exact public frontend origin.
5. Set a persistent `SECRET_KEY` in `backend/.env`.

Preferred options:

- Cloudflare Tunnel + Cloudflare Access for admin login gating.
- Tailscale/WireGuard VPN for private-device-only access.

Minimum production `.env` values:

```env
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=<strong random 32+ byte secret>
CORS_ORIGINS=https://your-admin-hostname.example.com
CORS_ALLOW_CREDENTIALS=true
EMAIL_ENABLED=true
```

## 3-2-1 Backup Strategy

3-2-1 means:

- 3 copies: live database plus two backups.
- 2 media: local disk plus external drive or cloud storage.
- 1 offsite: cloud/offsite copy.

Implemented scripts:

- `backup-321.sh`
- `backup.conf`
- `setup-backup-schedule.sh`
- `com.icanstudio.attendance-payroll.backup.plist`

Required configuration:

- `DATABASE_PATH=./backend/attendance_payroll.db`
- Set `EXTERNAL_BACKUP_DIR` to an external drive path for true second-media backup.
- Set `CLOUD_BACKUP_ENABLED=true` and configure `RCLONE_REMOTE`/`RCLONE_BUCKET` for true offsite backup.

Manual backup:

```bash
./backup-321.sh
```

Scheduled backup:

```bash
./setup-backup-schedule.sh
```

Backup verification:

- Every backup creates `MANIFEST.txt`.
- Every backup creates `checksums.sha256`.
- `backup-321.sh` verifies the latest local backup after creation.

## Rollback Strategy

Version 1.1 restore point:

- Code tag: `v1.1`
- Database backup: `backups/local/version-1.1-20260609/attendance_payroll_v1.1_20260609.db`
- Notes: `backups/local/version-1.1-20260609/RESTORE-NOTES.txt`

Rollback code:

```bash
git checkout v1.1
```

Rollback database:

```bash
cp backups/local/version-1.1-20260609/attendance_payroll_v1.1_20260609.db backend/attendance_payroll.db
./start-servers.sh
```

Before any rollback, create a fresh backup of the current state.

## Authorization And Data Access

Current rule:

- Admin users can see all records.
- Employee users can only see their own employee-linked records in employee, attendance, leave, payroll, and payslip endpoints.

Security expectation:

- Never trust frontend filtering for access control.
- Keep all employee ownership checks in backend routes.
- For new routes, use `get_current_user` and compare `current_user.employee_id` against the requested record owner.
- Use `get_current_admin` for admin-only actions.

## XSS And SQL Injection Controls

Implemented:

- SQLAlchemy ORM parameterization for database operations.
- Request validation middleware for SQL injection and XSS pattern blocking.
- Security headers middleware including CSP, frame blocking, content sniffing protection, and permissions policy.
- File upload MIME validation for spreadsheet imports.

Development rule:

- Avoid raw SQL string interpolation.
- If raw SQL is needed, use SQLAlchemy `text()` with bound parameters.
- Never render user-entered HTML as HTML in React.

## Rate Limiting

Implemented:

- Login-specific limiter.
- Global API rate limiting middleware.
- Stricter auth/import/export limits.
- `Retry-After` response header on 429 responses.

For multi-server deployment, replace the in-process limiter with Redis or edge/WAF rate limits.

## CORS Policy

Development:

- `CORS_ORIGINS=*` is acceptable for local LAN testing only.

Production:

- `CORS_ORIGINS=*` is blocked by config validation.
- Use exact trusted origins only.

Example:

```env
CORS_ORIGINS=https://payroll-admin.example.com
```

## Password Reset Security

Current reset model:

- Admin-only reset.
- Temporary random password.
- User must change password on next login.
- Reset is audit logged.

Required operational rule:

- Temporary passwords must be delivered out-of-band.
- Do not send temporary passwords through public chat.
- Enable email once SMTP is configured.

Future enhancement:

- Add expiring, single-use password reset tokens stored in DB.

## Error Handling And Logging

Implemented:

- Global exception handler hides stack traces from users.
- Rotating app log at `logs/app.log`.
- Backend launch log at `/tmp/payroll-backend.log`.
- Frontend launch log at `/tmp/payroll-frontend.log`.
- Audit logs for sensitive actions.

Manual health check:

```bash
scripts/production-health-check.sh
```

Alerts:

- The health check writes alerts to `logs/health-alerts.log`.
- For production, schedule it every 5 minutes and route alerts to email, Slack, or SMS.

## Database Indexes And Normalization

Implemented additive indexes:

- Attendance by employee/date and date/status.
- Payslips by payroll run/employee and employee/release state.
- Payroll runs by period/status.
- Users by status/role.
- Loans by employee/status.
- Leave requests by employee/status.
- Audit logs by resource.

Current DB is normalized enough for this app size. For larger deployment, move from SQLite to PostgreSQL.

## Failover During Development And Updates

Implemented:

- LaunchAgents keep backend/frontend alive.
- `start-servers.sh` is launchd-aware and restarts managed services.
- Frontend LaunchAgent builds and serves `vite preview --strictPort`.
- Health script verifies frontend, backend, backups, and critical logs.

Deployment process:

1. Create backup: `./backup-321.sh`.
2. Commit/tag restore point if needed.
3. Build frontend: `cd frontend && npm run build`.
4. Compile backend: `cd backend && venv/bin/python -m compileall app`.
5. Restart: `./start-servers.sh`.
6. Verify: `scripts/production-health-check.sh`.

## Scalability Roadmap

The current single-node system is adequate for small internal use. For growth:

- Load balancer: put Caddy/Nginx/Cloudflare in front of frontend/API.
- CDN: serve frontend static assets through Cloudflare.
- Cache: Redis for rate limits, sessions/token blacklist, frequent holiday/settings reads.
- Message queue: Redis Queue, Celery, or Dramatiq for PDF generation, imports, backups, and email.
- Database: migrate SQLite to PostgreSQL.
- Replication: PostgreSQL streaming replication or managed DB read replica.
- Sharding: not needed now; only consider after PostgreSQL indexes and read replicas are insufficient.
- Monitoring: uptime check, disk usage, backup freshness, API error rate, process health.
- Logs: ship app logs and audit logs to a central store.

Do not add sharding, queues, or load balancers prematurely. The next real scale step is PostgreSQL + Redis + tunnel/VPN access.
