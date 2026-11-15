-- Supabase grants new tables to the `anon` and `authenticated` roles by default, through
-- `ALTER DEFAULT PRIVILEGES` on the project's `postgres` role. A server-owned table created by the
-- migrations above therefore reaches the browser through PostgREST the moment it exists, even
-- though it is revoked from PUBLIC.
--
-- The rollout's own verification caught this on production: it refuses to finish while an
-- `anon` or `authenticated` privilege remains on a server-only table, which is why the whole
-- transaction rolled back instead of half-applying. This is the migration that answers it.
--
-- On a plain PostgreSQL (self-hosted, no Supabase roles) both roles are absent and the guard skips
-- them; the RLS line is harmless there. Idempotent, additive, no drops.

DO $$
DECLARE
  table_name TEXT;
  role_name TEXT;
  server_only TEXT[] := ARRAY[
    'ApiKey', 'ApiKeyEvent', 'ApiKeyUsage', 'ConnectCode', 'Assignment', 'Protocol',
    'HealthImportConnection', 'Study', 'StudyMember', 'StudyParticipant', 'StudyConsent',
    'AiDailyUsage', 'InsightsCache', 'ExperimentAttestation'
  ];
BEGIN
  FOREACH table_name IN ARRAY server_only LOOP
    -- A database that predates one of these tables (or a fresh install mid-migration) keeps going.
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
