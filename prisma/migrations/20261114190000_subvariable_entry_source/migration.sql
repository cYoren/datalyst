-- Per-variable provenance. A hand edit used to clear only the day's source, so one edited
-- variable blocked an app's resync of a different variable on the same day.

ALTER TABLE "SubvariableEntry" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- Backfill from the day's source: everything an app or an import wrote that day came from it.
UPDATE "SubvariableEntry" AS se
SET "source" = he."source"
FROM "HabitEntry" AS he
WHERE se."habitEntryId" = he."id" AND se."source" IS NULL AND he."source" IS NOT NULL;
