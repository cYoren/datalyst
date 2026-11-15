# Service readiness

Status: current. Written for `ROADMAP.md` S4 — what has to be true before anyone pays
for Datalyst, and how each of those things is checked.

This is the run-the-service half. LGPD/GDPR requests, consent records and the retention
schedule stay in `PRIVACY_OPERATIONS.md`; the product direction is `PRODUCT.md`; the
data-handling contract for connected apps is `CONNECTED-APPS.md`.

## 1. The check a monitor can call

`GET /api/health` answers in one body:

```json
{ "ok": true, "checks": { "database": true }, "version": "<commit>", "time": "<iso>" }
```

- **200** when the database answered a `SELECT 1` within two seconds.
- **503** when it did not. A slow database is reported as down, not as a healthy app.
- No counts, no user data, no dependency versions: a health endpoint that describes the stack
  is an invitation.

Point the uptime monitor at `https://datalyst.one/api/health`, expect `200`, alert after two
consecutive failures one minute apart (a single blip during a deploy is noise; two is a state).
The endpoint is `no-store` and does not require a session.

## 2. Error reporting, with no values in it

Sentry is wired for the edge, the server and the browser (`src/sentry.*.config.ts`,
`src/instrumentation-client.ts`). All three share `sentryPrivacyOptions` from
`src/lib/sentry-scrub.ts`, which every event passes through:

Two layers, because one is never enough.

**Collection stopped at the source** (`dataCollection`, the option that replaced
`sendDefaultPii` in SDK v11): request and response headers, bodies, cookies, URL query
parameters, user info, database query parameters, local variable values, AI inputs and MCP
content, queue arguments. The SDK never gathers them, so they cannot leak.

**Scrubbed on the way out** (`beforeSend`, and `beforeSendTransaction` because `beforeSend` is
never called for transactions):

| Removed | Kept |
| --- | --- |
| request body, cookies, query string, and the query inside `request.url` | route, method, status |
| every header but `content-type`, `accept`, `accept-language`, `user-agent`, `host` | which runtime answered |
| the person's email, username and IP (the account id stays) | the exception type, its stack, the release |
| **every breadcrumb message** (our own `console.error('save failed: ' + note)` would otherwise carry the note) | breadcrumb category and level |
| every `extra` value, span data, unfamiliar contexts | — |
| **quoted text of 16+ characters inside an exception message** | the shape of the message, e.g. *Unique constraint failed on the fields: (`id`)* |

`sentry-scrub.test.ts` holds one test per row. What is **not** guaranteed: a third-party error
message that embeds a value without quotes. The failure mode is named rather than papered over.

## 3. A restore that has been drilled

The database is Postgres. Backups are taken by the host (Supabase manages the current instance);
the restore path is a `pg_dump`/`pg_restore` pair into a scratch database.

## A merge that adds a column is not finished until the database has it

Cloudflare deploys on merge; the database does not. The code that lands selects the new columns
immediately, so the migration is part of the release, not a follow-up.

The 2026-11-14 release added eight migrations, all additive (`ADD COLUMN IF NOT EXISTS`, new tables,
new indexes, no drops), and the bundle is generated from the repository rather than written by hand:

```sh
# 1. Render the bundle (no connection).
node scripts/prepare-db-rollout.mjs --out /tmp/datalyst-rollout

# 2. Read-only, and it fails closed if the database is not at the pinned baseline.
psql "$DATABASE_URL" -f /tmp/datalyst-rollout/catalog-preflight.sql
psql "$DATABASE_URL" -f /tmp/datalyst-rollout/preflight.sql

# 3. Apply, then prove the schema now matches the code.
psql "$DATABASE_URL" -f /tmp/datalyst-rollout/apply.sql
psql "$DATABASE_URL" -f /tmp/datalyst-rollout/verify.sql
```

What they change: `User.plan` + `planChangedAt` (M1), `ApiKey.appId` and
`readableSubvariableIds` (S1), `ApiKeyUsage` and its `subject` + nullable `apiKeyId` (S2),
`Habit.appTrackerKey`, `Habit.templateOrigin`, `Habit.createdByAppId`, `SubvariableEntry.source`
(S1), and the browser-role revoke described below.

Until `apply.sql` runs, Settings, the connect flow and every account-key request fail on a column
that does not exist yet — and both signals look healthy: the health check answers `{ok:true}` because
it only runs `SELECT 1`, and a missing column reaches the client as **401**, because
`authenticateAgent` swallows the database error.

### The trap this release hit: Supabase grants new tables to `anon`

Applying it to production failed on the first attempt, and the failure was the useful kind. The
bundle's last statement refuses to commit while an `anon` or `authenticated` privilege remains on a
server-only table; it found `ApiKeyEvent` and rolled the entire transaction back — nothing was
half-applied.

The cause is a Supabase behaviour, not a mistake in this repository. Every migration does
`REVOKE ALL ... FROM PUBLIC`, which is complete on a plain PostgreSQL. Supabase projects also carry
`ALTER DEFAULT PRIVILEGES` for the `postgres` role, so every table a migration creates is granted to
`anon` and `authenticated` the moment it exists, and those roles reach PostgREST — the browser.
`REVOKE ... FROM PUBLIC` does not touch them.

`prisma/migrations/20261114200000_revoke_browser_roles` answers it: for each server-owned table it
enables RLS and revokes from both roles, skipping a role that does not exist so a self-hosted
PostgreSQL behaves exactly as before. **Any new server-only table needs this**, either by being
added to that migration's list or by revoking in its own.

Applied and verified on 2026-11-14 against project `ccgprpgwntuaealojtch`: the ten new columns and
three new tables are present with the types Prisma expects, all fourteen server-only tables report
`rls = true` and no `anon`/`authenticated` grant, `User.plan` is `free` for all 18 existing accounts
with `planChangedAt` backfilled, and the site answers `{ok:true}` from `/api/health` with a genuine
401 for a bogus key.

The drill, in full:

1. Take a fresh dump from the current instance with `pg_dump --no-owner --no-acl`.
2. Create an empty scratch database **not** reachable by the app.
3. `pg_restore` into it, then run `npm run check:migrations` against the restored copy and
   `scripts/prepare-db-rollout.mjs` in verify mode to confirm the schema matches what the code
   expects.
4. Sign in on a build pointed at the scratch database, open one account with real history and
   check that its check-ins, patterns and an experiment render.
5. Delete the scratch database and record the date, the dump size and how long the restore took.

**Drill log**

| Date | Dump size | Restore time | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-11-14 | 517 KB custom-format dump of a 16 MB database; `pg_dump --no-owner --no-acl` took 42 s | 4 s into a fresh database in the same instance | **passed**, with one finding | 19 accounts, 48 trackers, 533 check-ins, 1 562 values, 8 experiments and 3 keys restored byte-for-byte equal to production. `npm run check:migrations` and the bundle's `verify.sql` both passed against the copy. The busiest account (`appreview@datalyst.one`, 126 check-ins) rendered through the real services: first-week source read its main tracker, pattern readiness found 66 pairs with 31 days together, and correlations computed 14 pairs. The scratch database was dropped afterwards.

**Finding: a restore into a fresh Supabase database is not a bare `pg_restore`.** The first attempt
failed on `schema "auth" already exists`, and a second on `type "EventType" already exists`, because
a Supabase project ships its own `auth`/`storage` schemas and a partially restored copy keeps the
types. The restore that works is:

```sh
pg_restore --no-owner --no-acl --no-privileges --schema=public \
  -h <host> -p 5432 -U postgres -d <scratch> dumpfile
```

Restoring into a database that already has app types needs a fresh database, not a retry. Record
the timing: 42 s to dump and 4 s to restore at today's size, so the drill itself is cheap and there
is no reason to defer it again. |

## 4. The database tier

A paused database is not a service. The current instance is on a tier that pauses after
inactivity, which is fine while everything is free and unacceptable the moment someone pays:
a person opening the app on a Monday must not wait for a cold start, and a background job must
not fail because the database was asleep.

Requirement before a plan is sold: a tier that does not pause, nightly backups with a retention
window of at least seven days, and a connection limit above the Worker's concurrency. The
Hyperdrive binding already pools connections; the tier decides whether the connection exists.

## 5. Who is paged, and how

- **Owner:** Gustavo (the only operator). Every alert goes to him; there is no rotation, and
  this document says so instead of implying one exists.
- **Channel:** the monitor's email plus a push notification; a phone that is not answered is
  a missed page, not a queue.
- **What is a page:** `/api/health` failing twice in a row, the error rate above one per
  hundred requests over five minutes, or a restore drill failure.
- **What is not a page:** a single 500, a slow request, a failed build. Those are read the next
  time the owner looks.
- **If the owner is unavailable:** the app keeps serving reads; writes fail closed; nothing is
  sold during that window. There is **no status page yet** — the honest signal is the monitor's
  alert, and a public status page is a gap to close before a plan is sold.

## 6. Self-hosted

The same health endpoint and the same error scrubbing ship in the self-hosted build. A
self-hosted operator's Sentry DSN is their own, and nothing is sent anywhere unless they set
one — the SDK stays disabled without it.
