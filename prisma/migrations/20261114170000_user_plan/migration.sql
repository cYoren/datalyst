-- The account's plan (ROADMAP.md M1). Everything that exists today is free; the column exists so
-- a gate asks one question instead of guessing.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'free';

-- When the plan last changed. It is also the cut-off M2 needs for "nobody loses what they
-- already had", so it is backfilled rather than left null: an account that has been free since it
-- was created has never lost anything, and the date it was created is when that started.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planChangedAt" TIMESTAMP(3);
UPDATE "User" SET "planChangedAt" = "createdAt" WHERE "planChangedAt" IS NULL;

-- A CHECK constraint makes the column safe in the database, not only in `normalizePlan`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_plan_check') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_plan_check" CHECK ("plan" IN ('free', 'plus'));
  END IF;
END $$;
