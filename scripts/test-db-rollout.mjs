// Always creates its own private Unix-socket DB. Accepts no URL or target option.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { root, prepare, catalog, serverOnly } from './prepare-db-rollout.mjs';

if (process.argv.length !== 2) throw new Error('This smoke test accepts no target or connection arguments');
// Keep the private socket short and inside the integration guard's fixed root,
// independent of an inherited TMPDIR pointing elsewhere.
const temp = mkdtempSync('/tmp/datalyst-rollout-smoke-');
const socket = path.join(temp, 'socket'); mkdirSync(socket, { mode: 0o700 });
const cluster = path.join(temp, 'cluster'), port = '55441';
const env = { PATH: process.env.PATH, HOME: temp, TMPDIR: temp, LANG: 'C.UTF-8', NODE_ENV: 'test', DATABASE_URL: `postgresql://datalyst_rollout@localhost:${port}/datalyst_rollout?host=${encodeURIComponent(socket)}` };
let started = false;
function run(command, args, input, allowFailure = false) {
  const result = spawnSync(command, args, { cwd: temp, env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || (!allowFailure && result.status !== 0)) throw new Error(`${command} failed: ${result.error ?? ''}\n${result.stderr}\n${result.stdout}`);
  return result;
}
function sql(input, database = 'datalyst_rollout', allowFailure = false) {
  return run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-U', 'datalyst_rollout', '-d', database], input, allowFailure);
}
function rejects(input, pattern) {
  const result = sql(input, 'datalyst_rollout', true);
  assert.notEqual(result.status, 0, 'Unsafe schema/data must abort');
  assert.match(result.stderr, pattern);
}
try {
  run('initdb', ['-D', cluster, '-U', 'datalyst_rollout', '--auth=trust', '--no-locale']);
  run('pg_ctl', ['-D', cluster, '-l', path.join(temp, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -p ${port}`, '-w', 'start']); started = true;
  run('createdb', ['-h', socket, '-p', port, '-U', 'datalyst_rollout', 'datalyst_rollout']);
  const config = path.join(temp, 'prisma.config.ts');
  const fixture = path.join(root, 'scripts/fixtures/legacy-schema-86f2192.prisma');
  writeFileSync(config, `import {defineConfig} from ${JSON.stringify(path.join(root, 'node_modules/prisma/config.js'))}; export default defineConfig({schema:${JSON.stringify(fixture)},engine:'classic',datasource:{url:${JSON.stringify(env.DATABASE_URL)}}});\n`);
  const baseline = run(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--config', config, '--from-empty', '--to-schema-datamodel', fixture, '--script']).stdout;
  sql(baseline); sql(readFileSync(path.join(root, 'scripts/fixtures/legacy-data.sql'), 'utf8'));
  const { files, manifest } = prepare();
  const legacy = catalog(readFileSync(fixture, 'utf8'));
  const preservationSql = `SELECT jsonb_build_object(${legacy.models.map(model => `'${model.table}',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM (SELECT ${model.columns.map(column => `"${column.column}"`).join(',')} FROM "${model.table}") t)`).join(',')}, '_prisma_migrations',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) FROM "_prisma_migrations" h));`;
  const original = JSON.parse(sql(preservationSql).stdout.trim());
  sql(files['catalog-preflight.sql']); sql(files['preflight.sql']);
  // Expression attributes have attnum=0: joining pg_attribute alone hides the
  // extra key and would wrongly accept UNIQUE(email, lower(id)) as UNIQUE(email).
  sql(`DROP INDEX "User_email_key"; CREATE UNIQUE INDEX "User_email_key" ON "User" (email, lower(id));
    INSERT INTO "User" (id,email,"updatedAt") SELECT 'expression-email-duplicate',email,'2026-01-01' FROM "User" WHERE id='legacy-owner';`);
  assert.equal(sql(`SELECT count(*) FROM "User" WHERE email='legacy-owner@synthetic.invalid';`).stdout.trim(), '2');
  for (const check of ['catalog-preflight.sql', 'preflight.sql', 'apply.sql']) rejects(files[check], /Unsupported baseline unique key/);
  sql(`DELETE FROM "User" WHERE id='expression-email-duplicate'; DROP INDEX "User_email_key";
    CREATE UNIQUE INDEX "User_email_key" ON "User" (email) INCLUDE (id);`);
  rejects(files['catalog-preflight.sql'], /Unsupported baseline unique key/);
  sql(`DROP INDEX "User_email_key"; ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE (email) DEFERRABLE INITIALLY DEFERRED;`);
  rejects(files['catalog-preflight.sql'], /Unsupported baseline unique key/);
  sql(`ALTER TABLE "User" DROP CONSTRAINT "User_email_key"; CREATE UNIQUE INDEX "User_email_key" ON "User" (email);`);
  sql(files['catalog-preflight.sql']);
  assert.deepEqual(JSON.parse(sql(preservationSql).stdout.trim()), original);
  // Unsupported drift and NULL/duplicate data fail before any migration runs.
  sql('ALTER TABLE "Habit" ADD COLUMN "healthMetric" integer;');
  rejects(files['apply.sql'], /Unsupported column type/);
  sql('ALTER TABLE "Habit" DROP COLUMN "healthMetric"; ALTER TABLE "Habit" ADD COLUMN "healthMetric" text; UPDATE "Habit" SET "healthMetric" = \'synthetic-same\';');
  rejects(files['apply.sql'], /Duplicate health trackers/);
  // A column new in 1.1 left by a partial rollout must match nullability and defaults.
  sql('ALTER TABLE "Habit" DROP COLUMN "healthMetric"; ALTER TABLE "Habit" ADD COLUMN "healthMetric" text NOT NULL DEFAULT \'\';');
  rejects(files['apply.sql'], /Unsupported nullability: Habit\.healthMetric/);
  sql('ALTER TABLE "Habit" DROP COLUMN "healthMetric"; ALTER TABLE "ApiKey" ADD COLUMN scopes text[];');
  rejects(files['apply.sql'], /Unsupported default: ApiKey\.scopes is none/);
  sql('ALTER TABLE "ApiKey" DROP COLUMN scopes; ALTER TABLE "User" ADD COLUMN "aiConsent" boolean NOT NULL DEFAULT true;');
  rejects(files['apply.sql'], /Unsupported default: User\.aiConsent is true, expected false/);
  sql('ALTER TABLE "User" DROP COLUMN "aiConsent"; ALTER TABLE "ApiKey" ADD COLUMN scopes text[];');
  sql('ALTER TABLE "ApiKey" DROP COLUMN scopes; ALTER TABLE "ApiKey" ADD COLUMN scopes text[] DEFAULT ARRAY[\'read\', \'write\']::text[]; UPDATE "ApiKey" SET scopes = NULL;');
  rejects(files['apply.sql'], /NULL API scopes/);
  sql('ALTER TABLE "ApiKey" DROP COLUMN scopes;');
  // A failure at the end rolls back *all* five migrations, index drop and backfill.
  rejects(files['apply.sql'].replace('COMMIT;\n', 'SELECT 1/0;\nCOMMIT;\n'), /division by zero/);
  assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_name='ApiKey' AND column_name='keyHash';`).stdout.trim(), '0');
  assert.equal(sql(`SELECT to_regclass('public."ApiKey_key_idx"') IS NOT NULL;`).stdout.trim(), 't');
  assert.deepEqual(JSON.parse(sql(preservationSql).stdout.trim()), original);
  // Model permissive legacy defaults, PUBLIC/table/column grants and a cache policy.
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; GRANT ALL ON "ApiKey", "InsightsCache", "Assignment", "Protocol" TO PUBLIC, anon, authenticated;
    GRANT SELECT (key) ON "ApiKey" TO anon; GRANT UPDATE (data) ON "InsightsCache" TO authenticated;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC, anon, authenticated;
    ALTER TABLE "InsightsCache" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can manage own insights cache" ON "InsightsCache" FOR ALL USING (true);`);
  sql(files['apply.sql']);
  assert.deepEqual(JSON.parse(sql(preservationSql).stdout.trim()), original);
  assert.equal(sql(`SELECT "keyHash" = encode(sha256(convert_to(key,'UTF8')),'hex') AND prefix = left(key,10) AND scopes = ARRAY['read','write'] FROM "ApiKey" WHERE id='legacy-key';`).stdout.trim(), 't');
  assert.equal(sql('SELECT bool_and(NOT "aiConsent") FROM "User";').stdout.trim(), 't');
  assert.equal(sql('SELECT count(*) FROM "ExperimentAttestation";').stdout.trim(), '0');
  assert.equal(sql('SELECT count(*) FROM "HealthImportConnection";').stdout.trim(), '0');
  // Existing same-named but incompatible objects must not be accepted just
  // because the original migrations use IF NOT EXISTS.
  sql('CREATE POLICY "unexpected browser policy" ON "ApiKey" FOR SELECT USING (true);');
  rejects(files['apply.sql'], /Unexpected policy/);
  sql('DROP POLICY "unexpected browser policy" ON "ApiKey"; DROP INDEX "ApiKey_keyHash_key"; CREATE INDEX "ApiKey_keyHash_key" ON "ApiKey" ("keyHash");');
  rejects(files['apply.sql'], /Required unique index missing or incompatible/);
  sql(`DROP INDEX "ApiKey_keyHash_key"; CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey" ("keyHash", lower(id));
    INSERT INTO "ApiKey" (id,name,"userId","keyHash",prefix) SELECT 'expression-hash-duplicate','Synthetic duplicate',"userId","keyHash",prefix FROM "ApiKey" WHERE id='legacy-key';`);
  assert.equal(sql(`SELECT count(*) FROM "ApiKey" WHERE "keyHash"=(SELECT "keyHash" FROM "ApiKey" WHERE id='legacy-key');`).stdout.trim(), '2');
  for (const check of ['verify.sql', 'apply.sql']) rejects(files[check], /Required unique index missing or incompatible/);
  sql(`DELETE FROM "ApiKey" WHERE id='expression-hash-duplicate'; DROP INDEX "ApiKey_keyHash_key";
    CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey" ("keyHash") INCLUDE (id);`);
  rejects(files['verify.sql'], /Required unique index missing or incompatible/);
  sql('DROP INDEX "ApiKey_keyHash_key"; CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey" ("keyHash"); ALTER TABLE "HealthImportConnection" DROP CONSTRAINT "HealthImportConnection_userId_fkey";');
  rejects(files['apply.sql'], /Required validated cascading foreign key missing/);
  sql('ALTER TABLE "HealthImportConnection" ADD CONSTRAINT "HealthImportConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE;');
  // Insert synthetic feature data before replay to prove it is also preserved.
  sql(`INSERT INTO "HealthImportConnection" (id,"userId",source) VALUES ('new-health','legacy-owner','apple_health');
    INSERT INTO "AiDailyUsage" (id,"userId",day,"reservedUsd") VALUES ('new-usage','legacy-owner','2026-10-08',0.01);
    INSERT INTO "Study" (id,name,"joinCode",protocol,"protocolHash","updatedAt") VALUES ('new-study','Synthetic study','synthetic-code','{}','synthetic-hash','2026-01-01');
    INSERT INTO "StudyMember" (id,"studyId","userId",role) VALUES ('new-member','new-study','legacy-owner','OWNER');
    INSERT INTO "StudyParticipant" (id,"studyId","userId",pseudonym,"experimentId","outcomeHabitId","outcomeVariableId","interventionHabitId",assignments) VALUES ('new-participant','new-study','legacy-owner','P-synthetic','legacy-experiment','legacy-outcome','legacy-value','legacy-independent','[]');
    INSERT INTO "StudyConsent" (id,"participantId","protocolHash","consentText") VALUES ('new-consent','new-participant','synthetic-hash','Synthetic informed consent');
    INSERT INTO "ExperimentAttestation" (id,"experimentId",kind,mode,snapshot,"dataHash","updatedAt") VALUES ('new-proof','legacy-experiment','PREREG','offchain','{}','synthetic-hash','2026-01-01');
    UPDATE "InsightsCache" SET "aiData" = '{"synthetic":"generated-evidence"}', "aiEvidenceHash" = 'synthetic-evidence-hash';`);
  const featureSnapshot = () => serverOnly.filter(table => !['ApiKey','InsightsCache'].includes(table)).map(table => sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM "${table}" t;`).stdout.trim());
  const newData = featureSnapshot();
  sql(files['preflight.sql']); sql(files['apply.sql']); sql(files['verify.sql']);
  assert.deepEqual(featureSnapshot(), newData);
  assert.deepEqual(JSON.parse(sql(preservationSql).stdout.trim()), original);
  assert.equal(sql(`SELECT "aiData"->>'synthetic' FROM "InsightsCache" WHERE id='legacy-cache';`).stdout.trim(), 'generated-evidence');
  for (const role of ['anon','authenticated']) for (const table of serverOnly) {
    rejects(`SET ROLE ${role}; SELECT * FROM "${table}";`, /permission denied/);
    rejects(`SET ROLE ${role}; DELETE FROM "${table}";`, /permission denied/);
  }
  rejects(`INSERT INTO "AiDailyUsage" (id,"userId",day) VALUES ('duplicate-usage','legacy-owner','2026-10-08');`, /unique constraint/);
  rejects(`INSERT INTO "ExperimentAttestation" (id,"experimentId",kind,mode,snapshot,"dataHash","updatedAt") VALUES ('duplicate-proof','legacy-experiment','PREREG','offchain','{}','synthetic','2026-01-01');`, /unique constraint/);
  rejects(`INSERT INTO "HealthImportConnection" (id,"userId",source) VALUES ('orphan','missing-user','apple_health');`, /foreign key constraint/);
  rejects(`UPDATE "ApiKey" SET scopes=NULL WHERE id='legacy-key';`, /not-null constraint/);
  rejects(`INSERT INTO "ApiKey" (id,name,"userId","keyHash",prefix) SELECT 'rejected-hash-duplicate','Synthetic duplicate',"userId","keyHash",prefix FROM "ApiKey" WHERE id='legacy-key';`, /unique constraint/);
  sql(`INSERT INTO "HabitEntry" (id,"habitId","userId","logicalDate",source,"updatedAt") VALUES ('imported','legacy-outcome','legacy-owner','2026-01-01','apple_health','2026-01-01');`);
  rejects(`INSERT INTO "HabitEntry" (id,"habitId","userId","logicalDate",source,"updatedAt") VALUES ('duplicate-imported','legacy-outcome','legacy-owner','2026-01-01','apple_health','2026-01-01');`, /unique constraint/);
  assert.equal(sql(`SELECT count(*) FROM "HabitEntry" WHERE "habitId"='legacy-outcome';`).stdout.trim(), '2');
  // The repository's old Supabase SQL is demonstrably incomplete for 1.1.
  run('createdb', ['-h', socket, '-p', port, '-U', 'datalyst_rollout', 'incomplete_legacy']);
  sql(readFileSync(path.join(root, 'prisma/supabase_migration.sql'), 'utf8').split('-- Enable Row Level Security')[0], 'incomplete_legacy');
  const incomplete = sql(files['preflight.sql'], 'incomplete_legacy', true);
  assert.notEqual(incomplete.status, 0); assert.match(incomplete.stderr, /Unsupported baseline/);
  run(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'generate', '--config', config, '--schema', path.join(root, 'prisma/schema.prisma')]);
  const serviceEnv = { ...env, DATALYST_ROLLOUT_PG_URL: env.DATABASE_URL };
  const serviceTest = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/services/db-rollout.integration.test.ts'], { cwd: root, env: serviceEnv, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (serviceTest.status !== 0 || !/Tests\s+1 passed/.test(serviceTest.stdout)) throw new Error(`Real service integration failed: ${serviceTest.stdout}\n${serviceTest.stderr}`);
  console.log(serviceTest.stdout);
  console.log('PASS: five migrations applied and replayed atomically; synthetic legacy/history and new feature rows preserved.');
  console.log('PASS: legacy/new expression indexes permitting duplicate emails/key hashes rejected; INCLUDE and deferred uniqueness rejected.');
  console.log('PASS: fail-closed baseline/type/duplicate/NULL checks, rollback, eleven server-only RLS/grants, unique/FK constraints and incomplete historical SQL rejection.');
  console.log(`PostgreSQL ${run('postgres', ['--version']).stdout.trim()}; bundle SHA256 ${manifest.artifacts['apply.sql']}`);
} finally {
  if (started) {
    try { run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
  rmSync(temp, { recursive: true, force: true });
}
