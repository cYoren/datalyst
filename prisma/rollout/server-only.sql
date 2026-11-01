-- Supplemental 1.1 hardening. Existing migration history is left unchanged.
-- These tables are accessed through the privileged server and its ownership,
-- consent, membership and revocation checks, never directly by browser roles.
DO $$
DECLARE
  table_name TEXT;
  role_name TEXT;
  column_names TEXT;
  grantee TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ApiKey', 'Assignment', 'Protocol', 'HealthImportConnection', 'Study', 'StudyMember',
    'StudyParticipant', 'StudyConsent', 'AiDailyUsage', 'InsightsCache',
    'ExperimentAttestation'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_names
      FROM pg_attribute WHERE attrelid = to_regclass(format('public.%I', table_name))
      AND attnum > 0 AND NOT attisdropped;
    FOREACH role_name IN ARRAY ARRAY['PUBLIC', 'anon', 'authenticated'] LOOP
      IF role_name = 'PUBLIC' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        grantee := CASE WHEN role_name = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END;
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s', table_name, grantee);
        -- Table-level REVOKE alone does not remove existing column grants.
        EXECUTE format('REVOKE ALL (%s) ON TABLE public.%I FROM %s', column_names, table_name, grantee);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- The original API-key SQL gives existing rows a default array but does not
-- declare it NOT NULL. Preflight rejects explicit NULLs for operator review.
ALTER TABLE public."ApiKey" ALTER COLUMN "scopes" SET NOT NULL;
