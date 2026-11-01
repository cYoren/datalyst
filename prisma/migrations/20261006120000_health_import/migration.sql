-- AlterTable
ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "healthMetric" TEXT;

-- AlterTable
ALTER TABLE "Subvariable" ADD COLUMN IF NOT EXISTS "healthKey" TEXT;

-- AlterTable
ALTER TABLE "HabitEntry" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Habit_userId_healthMetric_key" ON "Habit"("userId", "healthMetric");

-- CreateIndex (hand-written: Prisma cannot express a partial index)
-- One imported entry per tracker and day, so two overlapping syncs can never duplicate a day.
CREATE UNIQUE INDEX IF NOT EXISTS "HabitEntry_imported_day_key" ON "HabitEntry"("habitId", "logicalDate") WHERE "source" IS NOT NULL;

-- Account-bound, revocable device connection; all import/delete actions serialize on the owner row.
CREATE TABLE IF NOT EXISTS "HealthImportConnection" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "source" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "HealthImportConnection_userId_active_idx" ON "HealthImportConnection"("userId", "active");
ALTER TABLE "HealthImportConnection" ENABLE ROW LEVEL SECURITY;
