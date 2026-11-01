-- Additive, idempotent PostgreSQL migration. Apply before deploying AI routes.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiConsentAt" TIMESTAMP(3);
ALTER TABLE "InsightsCache" ADD COLUMN IF NOT EXISTS "aiData" JSONB;
ALTER TABLE "InsightsCache" ADD COLUMN IF NOT EXISTS "aiEvidenceHash" TEXT;
ALTER TABLE "InsightsCache" ADD COLUMN IF NOT EXISTS "aiExpiresAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "AiDailyUsage" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "day" TEXT NOT NULL,
  "reservedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiDailyUsage_userId_day_key" ON "AiDailyUsage"("userId", "day");

-- Reservations and generated evidence are server-owned. Browser roles must not
-- read other accounts' usage, reset their own budget, or forge cached results.
ALTER TABLE "AiDailyUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsightsCache" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own insights cache" ON "InsightsCache";
REVOKE ALL ON TABLE "AiDailyUsage", "InsightsCache" FROM PUBLIC;
DO $$
DECLARE browser_role TEXT;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "AiDailyUsage", "InsightsCache" FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
