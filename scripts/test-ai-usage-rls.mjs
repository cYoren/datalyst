// Disposable local PostgreSQL only. Never reads DATABASE_URL or project secrets.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const temp = mkdtempSync(join(tmpdir(), 'datalyst-ai-rls-'));
const data = join(temp, 'data');
const socket = join(temp, 'socket');
mkdirSync(socket);
const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', PGHOST: socket, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: process.env.USER, PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null' };
function run(command, args, input) {
    const result = spawnSync(command, args, { cwd: root, env, input, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr}`);
    return result.stdout;
}
let started = false;
try {
    const config = join(temp, 'prisma.config.ts');
    writeFileSync(config, `import { defineConfig } from ${JSON.stringify(fileURLToPath(new URL('node_modules/prisma/config.js', root)))};\nexport default defineConfig({ schema: ${JSON.stringify(fileURLToPath(new URL('prisma/schema.prisma', root)))}, engine: 'classic', datasource: { url: 'postgresql://localhost/offline_schema_only' } });\n`);
    const schemaOutput = run(process.execPath, [fileURLToPath(new URL('node_modules/prisma/build/index.js', root)), 'migrate', 'diff', '--config', config, '--from-empty', '--to-schema-datamodel', fileURLToPath(new URL('prisma/schema.prisma', root)), '--script']);
    const schemaStart = schemaOutput.search(/^-- Create/m);
    if (schemaStart < 0) throw new Error('Prisma did not emit schema SQL');
    const schema = schemaOutput.slice(schemaStart);
    run('initdb', ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(temp, 'postgres.log'), '-o', `-k ${socket} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], schema);
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE "AiDailyUsage", "InsightsCache" TO PUBLIC, anon, authenticated, service_role;
CREATE POLICY "Users can manage own insights cache" ON "InsightsCache" FOR ALL USING (true);
${readFileSync(new URL('../prisma/migrations/20261007150000_ai_insights/migration.sql', import.meta.url), 'utf8')}
-- Replay proves the additive migration is idempotent.
${readFileSync(new URL('../prisma/migrations/20261007150000_ai_insights/migration.sql', import.meta.url), 'utf8')}
INSERT INTO "User" (id, email, "updatedAt") VALUES ('owner', 'owner@example.invalid', now()), ('other', 'other@example.invalid', now());
INSERT INTO "AiDailyUsage" (id, "userId", day) VALUES ('usage-owner', 'owner', '2026-10-07'), ('usage-other', 'other', '2026-10-07');
INSERT INTO "InsightsCache" (id, "userId", data, "expiresAt", "aiData") VALUES ('cache-owner', 'owner', '{}', now(), '{"findings":[]}'), ('cache-other', 'other', '{}', now(), '{"findings":[]}');
DO $$
DECLARE client_role TEXT; table_name TEXT; statement TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH table_name IN ARRAY ARRAY['AiDailyUsage', 'InsightsCache'] LOOP
      IF has_table_privilege(client_role, format('%I', table_name), 'SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'Unexpected client grant: % %', client_role, table_name;
      END IF;
      EXECUTE format('SET LOCAL ROLE %I', client_role);
      FOREACH statement IN ARRAY ARRAY[
        format('SELECT * FROM %I', table_name),
        format('UPDATE %I SET id = id', table_name),
        format('DELETE FROM %I', table_name),
        format('INSERT INTO %I (id) VALUES (''blocked'')', table_name)
      ] LOOP
        BEGIN
          EXECUTE statement;
          RAISE EXCEPTION 'Client operation unexpectedly allowed: %', statement;
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END LOOP;
      RESET ROLE;
    END LOOP;
  END LOOP;
END $$;
-- Defense in depth: even accidental grants cannot bypass default-deny RLS.
GRANT ALL ON TABLE "AiDailyUsage", "InsightsCache" TO anon, authenticated;
DO $$
DECLARE client_role TEXT; table_name TEXT; count_rows BIGINT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', client_role);
    FOREACH table_name IN ARRAY ARRAY['AiDailyUsage', 'InsightsCache'] LOOP
      EXECUTE format('SELECT count(*) FROM %I', table_name) INTO count_rows;
      IF count_rows <> 0 THEN RAISE EXCEPTION 'RLS exposed rows'; END IF;
      EXECUTE format('UPDATE %I SET id = id', table_name);
      GET DIAGNOSTICS count_rows = ROW_COUNT;
      IF count_rows <> 0 THEN RAISE EXCEPTION 'RLS permitted update'; END IF;
      EXECUTE format('DELETE FROM %I', table_name);
      GET DIAGNOSTICS count_rows = ROW_COUNT;
      IF count_rows <> 0 THEN RAISE EXCEPTION 'RLS permitted delete'; END IF;
      BEGIN
        IF table_name = 'AiDailyUsage' THEN
          INSERT INTO "AiDailyUsage" (id, "userId", day) VALUES ('blocked', 'owner', '2026-10-08');
        ELSE
          INSERT INTO "InsightsCache" (id, "userId", data, "expiresAt") VALUES ('blocked', 'owner', '{}', now());
        END IF;
        RAISE EXCEPTION 'RLS permitted insert';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
    END LOOP;
    RESET ROLE;
  END LOOP;
END $$;
SET ROLE service_role;
DO $$ BEGIN
  IF (SELECT count(*) FROM "AiDailyUsage") <> 2 OR (SELECT count(*) FROM "InsightsCache") <> 2 THEN
    RAISE EXCEPTION 'Server role cannot access AI data';
  END IF;
END $$;
RESET ROLE;
DELETE FROM "User" WHERE id = 'owner';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "AiDailyUsage" WHERE "userId" = 'owner') OR EXISTS (SELECT 1 FROM "InsightsCache" WHERE "userId" = 'owner') THEN
    RAISE EXCEPTION 'Account deletion did not cascade';
  END IF;
  IF (SELECT count(*) FROM "AiDailyUsage" WHERE "userId" = 'other') <> 1 OR (SELECT count(*) FROM "InsightsCache" WHERE "userId" = 'other') <> 1 THEN
    RAISE EXCEPTION 'Deletion crossed account ownership';
  END IF;
END $$;
`);
    console.log('AI DB checks passed: migration replay, browser CRUD denial, RLS defense, server access, owner-only deletion cascades.');
} finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(temp, { recursive: true, force: true });
}
