-- Read-only inventory used by docs/MIGRATION_BASELINE.md, step 1.
--
--   psql "$DATABASE_URL" -f docs/sql/migration-inventory.sql
--
-- Answers two questions and changes nothing:
--   1. which marker object each migration creates already exists in this database;
--   2. which migrations `_prisma_migrations` already records.
--
-- `present = t` means the objects that migration creates are there. It is not proof that the
-- migration ran: the objects may have been created by hand. It is proof that resolving it as
-- applied would not hide missing objects.
BEGIN READ ONLY;

WITH expected(name, present) AS (VALUES
  ('0_postgres_baseline',
   to_regclass('public."User"') IS NOT NULL AND to_regclass('public."Experiment"') IS NOT NULL),
  ('20261006000000_api_key_hashes',
   EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ApiKey' AND column_name = 'keyHash')),
  ('20261006120000_health_import',
   to_regclass('public."HealthImportConnection"') IS NOT NULL),
  ('20261007120000_add_studies',
   to_regclass('public."Study"') IS NOT NULL),
  ('20261007150000_ai_insights',
   to_regclass('public."AiDailyUsage"') IS NOT NULL),
  ('20261007153000_experiment_attestations',
   to_regclass('public."ExperimentAttestation"') IS NOT NULL),
  ('20261008000000_ai_usage_fk_on_update',
   EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
           WHERE t.relname = 'AiDailyUsage'
             AND c.conname = 'AiDailyUsage_userId_fkey'
             AND c.confupdtype = 'c'))
)
SELECT name, present FROM expected ORDER BY name;

DO $$
DECLARE recorded TEXT;
BEGIN
  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE NOTICE 'prisma history: no _prisma_migrations table (every migration was applied by hand)';
  ELSE
    SELECT string_agg(migration_name, ', ' ORDER BY migration_name) INTO recorded FROM _prisma_migrations;
    RAISE NOTICE 'prisma history: %', coalesce(recorded, 'empty');
  END IF;
END $$;

COMMIT;
