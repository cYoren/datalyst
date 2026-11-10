# PostgreSQL migration baseline

Status: current. Supersedes every "do not use `prisma migrate deploy`" note in the older
studies, attestation, AI-insights and health-import docs. Those notes described the problem this
document fixes.

## The problem, in one paragraph

`prisma/migrations/migration_lock.toml` declared `provider = "sqlite"` while `prisma/schema.prisma`
and every hosted database are PostgreSQL. Under a SQLite lock, `prisma migrate deploy` refuses to run
against PostgreSQL, so a migration created in this repository could not be applied by Prisma at all.
The only way anyone applied the PostgreSQL migrations was by hand (psql or the Supabase SQL editor),
which leaves `_prisma_migrations` empty or wrong and makes every later deploy a guess. The history also
began with two SQLite migrations (`init`, `add_habit_templates`) whose DDL cannot execute on PostgreSQL.

## What this change did (repository only, no database touched)

| Change | Why |
| --- | --- |
| `migration_lock.toml` → `provider = "postgresql"` | matches `prisma/schema.prisma`; Prisma can deploy again |
| `20251123000416_init`, `20251123200741_add_habit_templates` moved to `prisma/legacy-sqlite-migrations/` | frozen SQLite-era history; never applied to PostgreSQL, never replayed |
| new `prisma/migrations/0_postgres_baseline/` | the PostgreSQL schema production ran at 1.0.5 (commit `86f2192`), generated offline from the pinned fixture `scripts/fixtures/legacy-schema-86f2192.prisma` |
| new `prisma/migrations/20261008000000_ai_usage_fk_on_update/` | `AiDailyUsage_userId_fkey` was created without `ON UPDATE CASCADE`, so `prisma migrate diff` reported permanent drift |
| `scripts/check-migration-baseline.mjs` + test | fails the build if a future migration is created under a SQLite lock or escapes the reviewed rollout bundle |

Verified locally on a disposable PostgreSQL 18 cluster (`initdb` in `/tmp`, deleted afterwards), never
against a hosted database:

- `npx prisma migrate deploy` on an empty database applied all 7 migrations
  (`0_postgres_baseline` … `20261008000000_ai_usage_fk_on_update`) and reported success.
- `npx prisma migrate diff --from-url <that database> --to-schema-datamodel prisma/schema.prisma`
  returned "This is an empty migration": the chain reproduces the current schema with no drift.
- The `ON UPDATE CASCADE` migration is idempotent: running it twice on the same database succeeded.
- Applying the five 1.1 migrations and `prisma/rollout/server-only.sql` by hand on top of the baseline
  also produced zero drift.

## Which migrations are applied in production

**None of them can be confirmed from this repository, and this document does not claim otherwise.**
What follows separates what was observed from what is inference.

What could be observed:

- the repository state above (files, SQL, the pinned schema fixture, the rollout renderer and its
  manifest, which itself records `productionTargetVerified: false`);
- the deployed site over anonymous HTTP: `POST https://www.datalyst.one/api/mcp` answers `401`
  (the MCP server is deployed) and `GET /api/v1/protocols` answers `200`. The studies routes sit behind
  the login redirect, so an anonymous request cannot tell whether they are deployed.

What could not be observed, and therefore is not asserted anywhere below:

- the contents of production `_prisma_migrations`;
- the actual columns, indexes, constraints, RLS flags or grants in the hosted database;
- any deploy, log or Supabase dashboard record.

No `DATABASE_URL` for a hosted database exists on this machine, and no migration was run against one.

| Migration | What it creates | Applied in production? | Why |
| --- | --- | --- | --- |
| `0_postgres_baseline` (new) | the 1.0.5 data model: `User`, `Habit`, `HabitTemplate`, `Subvariable`, `HabitEntry`, `SubvariableEntry`, `AppSessionLog`, `UserEvent`, `InsightsCache`, `Experiment`, `Assignment`, `Protocol`, `ApiKey` | **Not executed anywhere.** On an existing database it must be marked applied, never run | the 1.0.5 release shipped, so this schema existed; the SQLite files could not have produced it on PostgreSQL |
| `20261006000000_api_key_hashes` | `ApiKey.keyHash`, `prefix`, `revokedAt`, `scopes`; unique `keyHash`; plaintext `key` nullable | Unknown. Must be present for the shipped MCP server and `/api/user/api-keys` to work | `authenticateAgent` reads `keyHash`/`scopes` on every agent request |
| `20261006120000_health_import` | `Habit.healthMetric`, `Subvariable.healthKey`, `HabitEntry.source`, `HealthImportConnection`, two unique indexes | Unknown | `docs/HEALTH_IMPORT_SECURITY.md` told operators to apply it by hand before deploying the code |
| `20261007120000_add_studies` | `Study`, `StudyMember`, `StudyParticipant`, `StudyConsent`, study enums | Unknown | `docs/researcher-studies.md` states the migration was supplied and no database was migrated by that change |
| `20261007150000_ai_insights` | `User.aiConsent`, `User.aiConsentAt`, `InsightsCache.ai*`, `AiDailyUsage` | Unknown | same pattern: additive, applied by hand before the AI routes |
| `20261007153000_experiment_attestations` | `ExperimentAttestation` | Unknown | `docs/VERIFIABLE_RESEARCH.md` says apply manually after review |
| `20261008000000_ai_usage_fk_on_update` (new) | aligns `AiDailyUsage_userId_fkey` with the Prisma model | **No.** New in this change | fixes drift introduced by the AI-insights migration |
| `20251123000416_init`, `20251123200741_add_habit_templates` | SQLite DDL | **Cannot be applied** to PostgreSQL | they contain SQLite-only statements; they are quarantined in `prisma/legacy-sqlite-migrations/` |

The point of the procedure below is to replace "unknown" with an observation, in one read-only query,
before any write happens.

## Procedure: baseline PostgreSQL without replaying SQLite DDL

Prerequisites: a PostgreSQL 14+ primary, a verified target (the identity query prints database, role,
server address and version), a restorable backup or snapshot, and a maintenance window. One operator.
Run everything from the repository root with `DATABASE_URL` pointing at the intended database and
nothing else.

### 1. Observe, read-only (safe, repeatable)

```sh
psql "$DATABASE_URL" -f docs/sql/migration-inventory.sql
```

`docs/sql/migration-inventory.sql` is wrapped in `BEGIN READ ONLY` and answers two questions: which
marker object each migration creates already exists, and whether `_prisma_migrations` exists at all.
Record the output. This table is the evidence the rest of the procedure relies on.

### 2. Review the offline bundle (no connection)

```sh
node scripts/prepare-db-rollout.mjs --out /tmp/datalyst-rollout
```

This renders `catalog-preflight.sql`, `preflight.sql`, `apply.sql`, `verify.sql` and `manifest.json`
without connecting to anything. `catalog-preflight.sql` and `preflight.sql` are read-only and fail
closed if the database does not match the pinned 1.0.5 fixture or contains unsupported drift. Run them:

```sh
psql "$DATABASE_URL" -f /tmp/datalyst-rollout/catalog-preflight.sql
psql "$DATABASE_URL" -f /tmp/datalyst-rollout/preflight.sql
```

If either fails, **stop**. The database is not at a baseline this repository can describe; reconcile
by hand first.

### 3. Mark the baseline as applied (bookkeeping only)

```sh
npx prisma migrate resolve --applied 0_postgres_baseline
```

This writes one row to `_prisma_migrations`. It runs no DDL, and it is correct only because step 1
showed the baseline objects present and step 2 showed they match the fixture.

### 4. Reconcile the 1.1 migrations

For each migration whose marker in step 1 was `t` (present, applied by hand earlier):

```sh
npx prisma migrate resolve --applied 20261006000000_api_key_hashes
# … one resolve per migration that is already in the database
```

For each migration whose marker was `f` (absent), do not resolve it. Let Prisma apply it:

```sh
npx prisma migrate deploy
```

Every 1.1 migration in this repository is written to be idempotent (`IF NOT EXISTS`,
`duplicate_object` handling, `ADD COLUMN IF NOT EXISTS`), so `deploy` is safe on a database where some
of them were already applied by hand — but resolving first keeps `deploy` from re-running DDL that is
already in place and keeps the history honest.

Order matters in one respect: `0_postgres_baseline` must be resolved before `deploy` runs, otherwise
Prisma tries to execute it and fails on the existing types.

### 5. Confirm

```sh
npx prisma migrate status
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script
psql "$DATABASE_URL" -f /tmp/datalyst-rollout/verify.sql
```

Expected: "Database schema is up to date", an empty migration, and `verify.sql` passing (RLS enabled
and browser roles revoked on the eleven server-only tables, required unique indexes and cascading
foreign keys present).

### 6. Afterwards

- Re-run step 1. Every row should be `t`, and `_prisma_migrations` should list all seven migrations.
- Keep `docs/sql/migration-inventory.sql` output with the change record; it is the only durable
  evidence of what production had before and after.
- The attestation, studies and AI features can now be deployed with their migrations applied through
  `prisma migrate deploy` rather than by hand. `docs/ATTESTATION_RUNBOOK.md` covers the attestation
  order of operations.

Never on a hosted database: `prisma migrate reset` (drops and recreates), `prisma db push` (skips
review and history), or `prisma migrate dev` (may reset).

## Rollback

Three independent layers, in increasing cost.

1. **Bookkeeping only.** A `resolve` can be undone by deleting that row:

   ```sql
   DELETE FROM _prisma_migrations WHERE migration_name = '<name>';
   ```

   No schema change, no data change. Do this if a migration was resolved but the objects turn out not
   to match.

2. **A migration applied by `deploy`.** Each 1.1 migration is additive: new tables, new nullable
   columns, new indexes. The inverse is written per migration in this table, and none of them is
   needed to keep the previous release running:

   | Migration | Inverse |
   | --- | --- |
   | `20261006000000_api_key_hashes` | `DROP INDEX "ApiKey_keyHash_key"`; drop `keyHash`, `prefix`, `revokedAt`, `scopes`; restore `key` `NOT NULL` only after the plaintext column is repopulated — the hashes are one-way, so this is a data-loss step, not a clean revert |
   | `20261006120000_health_import` | drop `HealthImportConnection`, `HabitEntry_imported_day_key`, `Habit_userId_healthMetric_key`, then the three columns |
   | `20261007120000_add_studies` | drop `StudyConsent`, `StudyParticipant`, `StudyMember`, `Study` and the two enums — **deletes study data and consent records** |
   | `20261007150000_ai_insights` | drop `AiDailyUsage`, the four `InsightsCache`/`User` columns and the restored policy |
   | `20261007153000_experiment_attestations` | drop `ExperimentAttestation` — **deletes frozen snapshots**; onchain hashes stay public and cannot be removed |
   | `20261008000000_ai_usage_fk_on_update` | `DROP CONSTRAINT "AiDailyUsage_userId_fkey"` and re-add without `ON UPDATE CASCADE` |

3. **Restore the snapshot.** The only rollback that returns the database to a known state without
   reasoning about data loss. Take it before step 3 and prefer it whenever a migration in layer 2
   would drop rows.

Rolling back the code is separate and simpler: the previous release does not read any of the new
tables, so an additive migration can stay in place while code rolls back. Do not drop objects to
"match" an older release.

## The guard

`scripts/check-migration-baseline.mjs` (run by `npm test` through
`scripts/check-migration-baseline.test.mjs`) fails when:

1. `prisma/schema.prisma` is not PostgreSQL;
2. `migration_lock.toml` disagrees with the schema provider — **this is the SQLite-lock failure**;
3. any migration contains SQLite-only DDL (`AUTOINCREMENT`, `PRAGMA`, `sqlite_*`, `WITHOUT ROWID`,
   `julianday`/`strftime`, `DATETIME`);
4. the frozen set in `prisma/legacy-sqlite-migrations/` changes, or one of those migrations reappears in
   the deployable history;
5. the baseline is missing, duplicated, or listed in the rollout bundle (it must never be applied to an
   existing database);
6. a PostgreSQL migration is missing from `scripts/prepare-db-rollout.mjs`, which would silently leave
   it out of the reviewed production bundle.

Run it directly with `node scripts/check-migration-baseline.mjs`.

## What this does not cover

- **Supabase's security layer.** The baseline reproduces the Prisma data model only. RLS policies,
  `anon`/`authenticated` grants and the policies in `prisma/supabase_migration.sql` are not part of the
  model. Existing deployments already have them; a fresh Supabase project must apply that file's RLS
  section separately, then `prisma/rollout/server-only.sql`.
- **The PR #17 migration.** `20261009180000_tracker_dashboard_compat` was never merged, so it is not
  part of this history. See that pull request's closing note.
- **Any execution.** This change creates files and proves them on a disposable local cluster. It does
  not run a migration, resolve, or write against a hosted database.
