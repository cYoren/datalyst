# Privacy Operations

This document describes operational steps for LGPD/GDPR requests and data retention. Adjust dates, contacts, and timelines as needed.

## Data Subject Requests (DSAR)
- Intake: accept requests via `contato@medicinahub.com.br` or in-app Settings.
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
- Purge job: call `/api/admin/retention` with `Authorization: Bearer $RETENTION_TASK_SECRET` on a schedule.
  - Vercel: `vercel.json` schedules a daily cron at 03:00 UTC and the endpoint accepts the `x-vercel-cron` header.
  - Configure `RETENTION_SESSION_LOG_DAYS`, `RETENTION_USER_EVENT_DAYS`, and `RETENTION_INSIGHTS_DAYS` as needed.

## Security and Incident Response
- Rotate secrets and service-role keys if compromised.
- Notify affected users and regulators within legal timelines if a breach occurs.
