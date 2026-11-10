// Guards the PostgreSQL migration history. Runs inside `npm test` (vitest).
// Offline: builds a throwaway fixture tree in the OS temp directory, never a database.
import { test, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMigrationBaseline, BASELINE, LEGACY_SQLITE } from './check-migration-baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const created = [];
afterAll(() => created.forEach(dir => rmSync(dir, { recursive: true, force: true })));

const POSTGRES_MIGRATION = '20261006000000_api_key_hashes';

/** A minimal repository whose history is coherent unless a test breaks it. */
function fixture({ lock = 'postgresql', extraMigration = null, extraMigrationSql = '', rollout = [POSTGRES_MIGRATION], legacy = LEGACY_SQLITE } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'datalyst-migrations-'));
  created.push(dir);
  const write = (relative, content) => {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), content);
  };
  write('prisma/schema.prisma', 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n');
  write('prisma/migrations/migration_lock.toml', `provider = "${lock}"\n`);
  write(`prisma/migrations/${BASELINE}/migration.sql`, 'CREATE TABLE "User" ("id" TEXT PRIMARY KEY);\n');
  write(`prisma/migrations/${POSTGRES_MIGRATION}/migration.sql`, 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "keyHash" TEXT;\n');
  if (extraMigration) write(`prisma/migrations/${extraMigration}/migration.sql`, extraMigrationSql);
  for (const name of legacy) write(`prisma/legacy-sqlite-migrations/${name}/migration.sql`, 'CREATE TABLE "X" ("id" TEXT NOT NULL PRIMARY KEY AUTOINCREMENT);\n');
  write('scripts/prepare-db-rollout.mjs', `export const migrationPaths = [\n${rollout.map(name => `  'prisma/migrations/${name}/migration.sql',`).join('\n')}\n].map(name => name);\n`);
  return dir;
}

test('the repository migration history is deployable', () => {
  expect(checkMigrationBaseline(root)).toEqual([]);
});

test('a sqlite migration lock is rejected', () => {
  const problems = checkMigrationBaseline(fixture({ lock: 'sqlite' }));
  expect(problems.join('\n')).toMatch(/migration_lock\.toml declares "sqlite"/);
});

test('a new migration created under a sqlite lock is rejected', () => {
  const problems = checkMigrationBaseline(
    fixture({ lock: 'sqlite', extraMigration: '20261101000000_new_thing', extraMigrationSql: 'ALTER TABLE "User" ADD COLUMN "x" TEXT;\n', rollout: [POSTGRES_MIGRATION, '20261101000000_new_thing'] })
  );
  expect(problems.join('\n')).toMatch(/migration_lock\.toml declares "sqlite"/);
});

test('sqlite-only DDL in a PostgreSQL migration is rejected', () => {
  const problems = checkMigrationBaseline(
    fixture({ extraMigration: '20261101000000_new_thing', extraMigrationSql: 'CREATE TABLE "T" ("id" INTEGER PRIMARY KEY AUTOINCREMENT);\n', rollout: [POSTGRES_MIGRATION, '20261101000000_new_thing'] })
  );
  expect(problems.join('\n')).toMatch(/AUTOINCREMENT is SQLite-only/);
});

test('a migration missing from the reviewed rollout bundle is rejected', () => {
  const problems = checkMigrationBaseline(
    fixture({ extraMigration: '20261101000000_new_thing', extraMigrationSql: 'SELECT 1;\n' })
  );
  expect(problems.join('\n')).toMatch(/20261101000000_new_thing is not in scripts\/prepare-db-rollout\.mjs/);
});

test('the rollout bundle may not apply the baseline', () => {
  const problems = checkMigrationBaseline(fixture({ rollout: [POSTGRES_MIGRATION, BASELINE] }));
  expect(problems.join('\n')).toMatch(/must not apply the baseline/);
});

test('changing the frozen SQLite-era migrations is rejected', () => {
  const problems = checkMigrationBaseline(fixture({ legacy: [...LEGACY_SQLITE, '20251124000000_late_sqlite'] }));
  expect(problems.join('\n')).toMatch(/legacy-sqlite-migrations must hold exactly/);
});

test('a missing baseline is rejected', () => {
  const dir = fixture();
  rmSync(path.join(dir, 'prisma', 'migrations', BASELINE), { recursive: true });
  expect(checkMigrationBaseline(dir).join('\n')).toMatch(/Missing PostgreSQL baseline/);
});
