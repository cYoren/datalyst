-- 20261007150000_ai_insights created AiDailyUsage_userId_fkey with ON DELETE
-- CASCADE but without ON UPDATE CASCADE, which Prisma emits for every relation.
-- The difference is invisible to the app (a User id never changes) and makes
-- `prisma migrate diff` report permanent drift, so align it here.
-- Idempotent: safe to run on a database that already has the aligned key, and a
-- no-op when the table does not exist yet.
DO $$
BEGIN
  IF to_regclass('public."AiDailyUsage"') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'AiDailyUsage'
      AND c.conname = 'AiDailyUsage_userId_fkey'
      AND c.confupdtype <> 'c'
  ) THEN
    ALTER TABLE public."AiDailyUsage" DROP CONSTRAINT "AiDailyUsage_userId_fkey";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'AiDailyUsage'
      AND c.conname = 'AiDailyUsage_userId_fkey'
  ) THEN
    ALTER TABLE public."AiDailyUsage"
      ADD CONSTRAINT "AiDailyUsage_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public."User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
