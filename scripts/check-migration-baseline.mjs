/**
 * Migration history guard.
 *
 * The repository once declared `provider = "sqlite"` in
 * prisma/migrations/migration_lock.toml while prisma/schema.prisma and every
 * hosted database are PostgreSQL. Under a SQLite lock `prisma migrate deploy`
 * refuses to run against PostgreSQL, so a new migration created then would be
 * born unappliable.
 *
 * This check fails when:
 *   1. the schema datasource is not PostgreSQL;
 *   2. migration_lock.toml disagrees with the schema provider (the sqlite lock);
 *   3. a migration contains SQLite-only DDL;
 *   4. the frozen SQLite-era migrations change, or a new one is added there;
 *   5. the PostgreSQL baseline is missing, duplicated, or wrongly included in
 *      the reviewed rollout bundle;
 *   6. a PostgreSQL migration is missing from scripts/prepare-db-rollout.mjs,
 *      which would silently leave it out of the reviewed production bundle.
 *
 * Read docs/MIGRATION_BASELINE.md before changing anything this file guards.
 * Offline only: it reads files and never opens a database connection.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE = '0_postgres_baseline';
/** SQLite-era history, frozen. Never applied to PostgreSQL. */
export const LEGACY_SQLITE = ['20251123000416_init', '20251123200741_add_habit_templates'];

const SQLITE_ONLY = [
  [/\bAUTOINCREMENT\b/i, 'AUTOINCREMENT is SQLite-only'],
  [/\bPRAGMA\b/i, 'PRAGMA is SQLite-only'],
  [/\bsqlite_(master|schema|sequence)\b/i, 'sqlite_* catalog tables are SQLite-only'],
  [/\bWITHOUT\s+ROWID\b/i, 'WITHOUT ROWID is SQLite-only'],
  [/\b(julianday|strftime)\s*\(/i, 'SQLite date functions are not PostgreSQL'],
  [/\bDATETIME\b/, 'DATETIME is not a PostgreSQL type (use TIMESTAMP)'],
];

const read = (...parts) => readFileSync(path.join(...parts), 'utf8');

function datasourceProvider(schema) {
  const block = schema.match(/datasource\s+\w+\s*\{([\s\S]*?)\}/);
  const provider = block?.[1].match(/provider\s*=\s*"([^"]+)"/)?.[1];
  return provider ?? null;
}

function lockProvider(toml) {
  return toml.match(/^\s*provider\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

function migrationDirs(migrationsDir) {
  return readdirSync(migrationsDir)
    .filter(name => statSync(path.join(migrationsDir, name)).isDirectory())
    .sort();
}

/** Migration directory names the reviewed rollout bundle would apply, in order. */
function rolloutInputs(script) {
  const block = script.match(/export const migrationPaths\s*=\s*\[([\s\S]*?)\]\.map\(/);
  if (!block) return null;
  // Entries are migration directory names; accept a full migration.sql path too.
  return [...block[1].matchAll(/'([^']+)'/g)].map(match =>
    match[1].includes('/') ? path.basename(path.dirname(match[1])) : match[1]
  );
}

/** Returns a list of problems. Empty means the history is coherent. */
export function checkMigrationBaseline(root) {
  const problems = [];
  const migrationsDir = path.join(root, 'prisma', 'migrations');
  const schema = read(root, 'prisma', 'schema.prisma');

  const schemaProvider = datasourceProvider(schema);
  if (schemaProvider !== 'postgresql') {
    problems.push(`prisma/schema.prisma datasource provider is "${schemaProvider ?? 'missing'}", expected "postgresql".`);
  }

  const lock = lockProvider(read(migrationsDir, 'migration_lock.toml'));
  if (lock !== schemaProvider) {
    problems.push(
      `prisma/migrations/migration_lock.toml declares "${lock ?? 'missing'}" but the schema uses ` +
        `"${schemaProvider ?? 'missing'}". A migration created under this lock cannot be deployed. ` +
        'Follow docs/MIGRATION_BASELINE.md before adding a migration.'
    );
  }

  const dirs = migrationDirs(migrationsDir);
  const postgres = dirs.filter(name => name !== BASELINE);
  if (!dirs.includes(BASELINE)) {
    problems.push(`Missing PostgreSQL baseline prisma/migrations/${BASELINE}/migration.sql.`);
  }
  if (dirs.filter(name => name === BASELINE).length > 1) {
    problems.push('More than one PostgreSQL baseline migration exists.');
  }
  for (const name of dirs) {
    if (!/^[0-9]/.test(name) && name !== BASELINE) problems.push(`Migration "${name}" does not sort as a timestamp.`);
    try {
      statSync(path.join(migrationsDir, name, 'migration.sql'));
    } catch {
      problems.push(`prisma/migrations/${name} has no migration.sql.`);
    }
  }

  for (const name of dirs) {
    let sql;
    try {
      sql = read(migrationsDir, name, 'migration.sql');
    } catch {
      continue;
    }
    for (const [pattern, why] of SQLITE_ONLY) {
      if (pattern.test(sql)) problems.push(`prisma/migrations/${name}/migration.sql: ${why}.`);
    }
  }

  const legacyDir = path.join(root, 'prisma', 'legacy-sqlite-migrations');
  const legacy = migrationDirs(legacyDir);
  if (legacy.join() !== LEGACY_SQLITE.join()) {
    problems.push(
      `prisma/legacy-sqlite-migrations must hold exactly ${LEGACY_SQLITE.join(', ')} (found ${legacy.join(', ') || 'nothing'}). ` +
        'Those files are frozen history; move a new SQLite migration there only with an explicit review.'
    );
  }
  for (const name of legacy) {
    if (dirs.includes(name)) problems.push(`SQLite-era migration "${name}" is back in the deployable history.`);
  }

  const inputs = rolloutInputs(read(root, 'scripts', 'prepare-db-rollout.mjs'));
  if (!inputs) {
    problems.push('Could not read migrationPaths from scripts/prepare-db-rollout.mjs.');
  } else {
    const listed = inputs;
    for (const name of postgres) {
      if (!listed.includes(name)) {
        problems.push(
          `prisma/migrations/${name} is not in scripts/prepare-db-rollout.mjs migrationPaths, ` +
            'so the reviewed rollout bundle would silently skip it.'
        );
      }
    }
    for (const name of listed) {
      if (!postgres.includes(name)) problems.push(`Rollout bundle lists "${name}", which is not a deployable migration.`);
      if (name === BASELINE) problems.push('The rollout bundle must not apply the baseline to an existing database.');
    }
  }

  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const problems = checkMigrationBaseline(root);
  if (problems.length) {
    console.error(`FAIL: migration history is not deployable.\n${problems.map(problem => `- ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log('PASS: PostgreSQL migration lock, baseline, frozen SQLite history and rollout bundle agree.');
}
