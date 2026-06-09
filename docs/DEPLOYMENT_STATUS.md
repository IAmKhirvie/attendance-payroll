# Attendance Payroll Deployment Status

Updated: 2026-06-09
Version: 1.1

## Running Access

- Local/LAN admin URL: `http://192.168.68.106:4500/admin`
- Backend health URL: `http://192.168.68.106:8500/health`
- Home access should be exposed through a private VPN or authenticated tunnel only. Do not port-forward the backend directly to the public internet.

## Enforced Now

- Authenticated API access with admin-only routes for payroll, reports, imports, users, backups, settings, loans, and management data.
- Employee-facing payroll, attendance, leave, and loan data is scoped to the logged-in employee unless the requester is an admin.
- Password hashing uses bcrypt. Password policy rejects short/common passwords and can require uppercase, number, and special characters.
- Admin password reset generates a random temporary password, forces password change, clears lockout state, and records an audit event.
- Login lockout and API rate limits are enabled.
- Production config refuses wildcard CORS when `ENVIRONMENT=production`.
- Backend writes rotating app logs to `logs/app.log`.
- `scripts/production-health-check.sh` checks frontend, backend, backup freshness/writability, and recent critical backend log markers.
- Database startup creates composite indexes for common attendance, payslip, payroll run, user, loan, leave, and audit queries.
- Version rollback point is tagged as `v1.1` and `final-draft-v1.1`.

## Backup Status

Strict 3-2-1 backup mode is enabled in `backup.conf`.

- Copy 1: local `backups/local`
- Copy 2: external `/Volumes/Server1/backups/attendance-payroll`
- Copy 3: offsite `/Volumes/ICAN-MATERIALS/backups/attendance-payroll`

The strict backup script intentionally fails if either external or offsite storage is not mounted and writable. That is required so backup failures are visible.

Current blocker verified on 2026-06-09:

- `/Volumes/Server1/backups/attendance-payroll` is mounted but not writable by the app user.
- `/Volumes/ICAN-MATERIALS/backups/attendance-payroll` is mounted but must also be writable before strict 3-2-1 can pass.
- Until those permissions are fixed, local backups work but production health intentionally fails at the external/offsite backup check.

## Operational Checks

Run before and after updates:

```bash
./backup.sh
./start-servers.sh
scripts/production-health-check.sh
```

If rollback is needed:

```bash
git checkout v1.1
cp backups/local/version-1.1-20260609/attendance_payroll_v1.1_20260609.db backend/attendance_payroll.db
./start-servers.sh
scripts/production-health-check.sh
```

## Scalability Path

The current app is sized for a small office deployment on one machine. For larger usage, add these in order:

- PostgreSQL with daily logical backups and point-in-time recovery.
- Redis plus Celery or Dramatiq for imports, PDF generation, backup jobs, and notification work.
- Reverse proxy/load balancer such as Nginx or Caddy with TLS.
- CDN for static frontend assets.
- Redis cache for repeated dashboard/report reads.
- Streaming logs and alerts through a monitoring service.
- Database read replica before sharding. Sharding is unnecessary until data volume is far beyond this deployment.
