# Privacy Operations

Status: current

This document describes operational steps for LGPD/GDPR requests and data retention. Adjust dates, contacts, and timelines as needed.

## Data Subject Requests (DSAR)
- Intake: accept requests via `contato@datalyst.one` or in-app Settings.
- Verify identity: confirm account ownership before sharing data.
- Response window: aim for 30 days; document any extensions.
- Fulfillment tools:
  - Access/export: Settings > "Download data export" or `/api/user/export`.
  - Rectification: Settings > Profile edits.
  - Deletion: Settings > "Delete my account".
- Record: keep an internal log of request date, type, outcome, and completion date.

## Consent Management
- Health data consent is stored on the user profile with a timestamp.
- Do not enable health-related tracking features without explicit consent.

## Retention
- AppSessionLog: default 90 days.
- UserEvent: default 365 days.
- InsightsCache: default 30 days or until `expiresAt`.
- ApiKeyUsage (rate-limit counters), ApiKeyEvent (what a key did) and spent ConnectCode rows:
  365 days, the same window as UserEvent. Counters are 86k rows a day at 60/min, so this is a
  leak if it is skipped.
- A person's own trackers, check-ins and experiments: kept until they delete them. Nothing in
  the retention job touches them.

Service readiness — the uptime check, the restore drill, who is paged, the database tier and what
error reporting may contain — is in `SERVICE_OPERATIONS.md`.
- Purge job: call `/api/admin/retention` with `Authorization: Bearer $RETENTION_TASK_SECRET` on a schedule.
  - Cloudflare: `wrangler.jsonc` schedules a daily cron at 03:00 UTC and `cloudflare-worker.ts` calls the endpoint with `RETENTION_TASK_SECRET`.
  - Configure `RETENTION_SESSION_LOG_DAYS`, `RETENTION_USER_EVENT_DAYS`, and `RETENTION_INSIGHTS_DAYS` as needed.

## Security and Incident Response
- Rotate secrets and service-role keys if compromised.
- Notify affected users and regulators within legal timelines if a breach occurs.
