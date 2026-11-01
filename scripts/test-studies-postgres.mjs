// Disposable synthetic PostgreSQL only. Never loads repository dotenv/config.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(tmpdir(), 'datalyst-pg-smoke-'));
const socket = path.join(temp, 'socket');
mkdirSync(socket, { mode: 0o700 });
const cluster = path.join(temp, 'cluster');
const url = `postgresql://datalyst_smoke@localhost:55439/datalyst_smoke?host=${encodeURIComponent(socket)}`;
// Allowlist instead of inheriting DB URLs, PG service/passfiles or app secrets.
const env = { PATH: process.env.PATH, HOME: temp, TMPDIR: temp, LANG: 'C.UTF-8', DATABASE_URL: url, DATALYST_LOCAL_PG_URL: url, NODE_ENV: 'test' };
let started = false;
function run(command, args, input, cwd = temp) {
  const result = spawnSync(command, args, { cwd, env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error ?? ''}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
function sql(input) { return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '55439', '-U', 'datalyst_smoke', '-d', 'datalyst_smoke'], input); }
try {
  run('initdb', ['-D', cluster, '-U', 'datalyst_smoke', '--auth=trust', '--no-locale']);
  run('pg_ctl', ['-D', cluster, '-l', path.join(temp, 'server.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -p 55439`, '-w', 'start']);
  started = true;
  run('createdb', ['-h', socket, '-p', '55439', '-U', 'datalyst_smoke', 'datalyst_smoke']);
  const config = path.join(temp, 'prisma.config.ts');
  writeFileSync(config, `import { defineConfig } from ${JSON.stringify(path.join(root, 'node_modules/prisma/config.js'))};\nexport default defineConfig({ schema: ${JSON.stringify(path.join(root, 'prisma/schema.prisma'))}, engine: 'classic', datasource: { url: ${JSON.stringify(url)} } });\n`);
  const baseline = run(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--config', config, '--from-empty', '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--script']);
  run(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'generate', '--config', config]);
  sql(baseline);
  // Render current schema offline, then simulate the pre-study baseline.
  sql('DROP TABLE "StudyConsent", "StudyParticipant", "StudyMember", "Study" CASCADE; DROP TYPE "StudyRole", "StudyStatus"; CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated;');
  const migration = readFileSync(path.join(root, 'prisma/migrations/20261007120000_add_studies/migration.sql'), 'utf8');
  sql(migration);
  sql(migration);
  const proofMigration = readFileSync(path.join(root, 'prisma/migrations/20261007153000_experiment_attestations/migration.sql'), 'utf8');
  sql('GRANT ALL ON "ExperimentAttestation" TO anon, authenticated;');
  sql(proofMigration);
  sql(proofMigration);
  sql(`DO $$ BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'ExperimentAttestation')
      OR has_table_privilege('anon', '"ExperimentAttestation"', 'SELECT')
      OR has_table_privilege('authenticated', '"ExperimentAttestation"', 'SELECT')
      THEN RAISE EXCEPTION 'Frozen evidence must be server-only'; END IF;
    END $$;`);
  const checks = sql(`SELECT count(*) FROM pg_class WHERE relname IN ('Study','StudyMember','StudyParticipant','StudyConsent') AND relrowsecurity;
    SELECT has_table_privilege('anon', '"StudyParticipant"', 'SELECT'), has_table_privilege('authenticated', '"StudyConsent"', 'SELECT');`);
  console.log('Migration first application + replay succeeded; RLS/grants:', checks.trim());
  const result = run(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/studies/postgres.integration.test.ts'], undefined, root);
  console.log(result);
  if (!/Tests\s+1 passed/.test(result)) throw new Error('The isolated PostgreSQL integration test did not execute');
} finally {
  if (started) {
    try { run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
  rmSync(temp, { recursive: true, force: true });
}
