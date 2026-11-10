-- PostgreSQL baseline for the schema production ran at 1.0.5 (commit 86f2192).
--
-- Generated offline, never executed against a hosted database:
--   npx prisma migrate diff --from-empty \
--     --to-schema-datamodel scripts/fixtures/legacy-schema-86f2192.prisma --script
--
-- Why this file exists: the two migrations before this one are SQLite DDL
-- (see prisma/legacy-sqlite-migrations) and cannot run on PostgreSQL. Mark this
-- migration as already applied on an existing database instead of running it:
--   npx prisma migrate resolve --applied 0_postgres_baseline
-- Read docs/MIGRATION_BASELINE.md before touching a hosted database.
--
-- Scope: the Prisma data model only. Supabase row-level security, the browser
-- role grants and the policies in prisma/supabase_migration.sql are not part of
-- the Prisma model and are not reproduced here. Existing deployments already
-- have them; a fresh Supabase project must apply them separately.

-- CreateEnum
CREATE TYPE "SubvariableType" AS ENUM ('NUMERIC', 'SCALE_0_10', 'BOOLEAN', 'CATEGORY');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('HABIT_CREATED', 'HABIT_UPDATED', 'HABIT_DELETED', 'ENTRY_CREATED', 'ENTRY_UPDATED', 'ENTRY_DELETED', 'SUBVARIABLE_CREATED', 'SUBVARIABLE_UPDATED');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('DAILY', 'WEEKLY', 'ADHOC');

-- CreateEnum
CREATE TYPE "TimeBlock" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME');

-- CreateEnum
CREATE TYPE "GoalDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "ExperimentType" AS ENUM ('OBSERVATIONAL', 'RANDOMIZED', 'BLIND_RCT');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RandomizationType" AS ENUM ('SIMPLE', 'BLOCKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "healthDataConsent" BOOLEAN NOT NULL DEFAULT false,
    "healthDataConsentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightsCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightsCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "icon" TEXT NOT NULL DEFAULT '🎯',
    "scheduleType" "ScheduleType" NOT NULL DEFAULT 'DAILY',
    "scheduleDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timeBlock" "TimeBlock" NOT NULL DEFAULT 'ANYTIME',
    "rank" INTEGER NOT NULL DEFAULT 0,
    "schedule" TEXT NOT NULL DEFAULT '{}',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "icon" TEXT NOT NULL DEFAULT '🎯',
    "defaultSchedule" TEXT NOT NULL DEFAULT '{}',
    "subvariableTemplate" TEXT NOT NULL DEFAULT '[]',
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subvariable" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SubvariableType" NOT NULL,
    "unit" TEXT,
    "prompt" TEXT,
    "goalDirection" "GoalDirection" NOT NULL DEFAULT 'NEUTRAL',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subvariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitEntry" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logicalDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "followedAssignment" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubvariableEntry" (
    "id" TEXT NOT NULL,
    "habitEntryId" TEXT NOT NULL,
    "subvariableId" TEXT NOT NULL,
    "numericValue" DOUBLE PRECISION NOT NULL,
    "rawValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubvariableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSessionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" TEXT NOT NULL DEFAULT 'web',
    "duration" INTEGER,

    CONSTRAINT "AppSessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ExperimentType" NOT NULL DEFAULT 'OBSERVATIONAL',
    "name" TEXT NOT NULL,
    "hypothesis" TEXT,
    "independentId" TEXT NOT NULL,
    "dependentId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "randomizationType" "RandomizationType" NOT NULL DEFAULT 'BLOCKED',
    "washoutPeriod" INTEGER NOT NULL DEFAULT 2,
    "isBlind" BOOLEAN NOT NULL DEFAULT false,
    "blockSize" INTEGER NOT NULL DEFAULT 4,
    "hypothesisLockedAt" TIMESTAMP(3),
    "analysisParams" TEXT NOT NULL DEFAULT '{}',
    "conditions" TEXT,
    "blindGuess" TEXT,
    "blindRevealedAt" TIMESTAMP(3),
    "status" "ExperimentStatus" NOT NULL DEFAULT 'PLANNING',
    "protocolId" TEXT,
    "attestationUid" TEXT,
    "attestationTx" TEXT,
    "slug" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "isWashout" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Protocol" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "independentTemplate" JSONB NOT NULL,
    "dependentTemplate" JSONB NOT NULL,
    "recommendedDuration" INTEGER NOT NULL DEFAULT 14,
    "recommendedWashout" INTEGER NOT NULL DEFAULT 2,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentId" TEXT,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InsightsCache_userId_key" ON "InsightsCache"("userId");

-- CreateIndex
CREATE INDEX "Habit_userId_idx" ON "Habit"("userId");

-- CreateIndex
CREATE INDEX "Habit_userId_archived_idx" ON "Habit"("userId", "archived");

-- CreateIndex
CREATE INDEX "Habit_templateId_idx" ON "Habit"("templateId");

-- CreateIndex
CREATE INDEX "HabitTemplate_userId_idx" ON "HabitTemplate"("userId");

-- CreateIndex
CREATE INDEX "HabitTemplate_userId_name_idx" ON "HabitTemplate"("userId", "name");

-- CreateIndex
CREATE INDEX "HabitTemplate_userId_useCount_idx" ON "HabitTemplate"("userId", "useCount");

-- CreateIndex
CREATE INDEX "Subvariable_habitId_idx" ON "Subvariable"("habitId");

-- CreateIndex
CREATE INDEX "Subvariable_habitId_active_idx" ON "Subvariable"("habitId", "active");

-- CreateIndex
CREATE INDEX "HabitEntry_habitId_idx" ON "HabitEntry"("habitId");

-- CreateIndex
CREATE INDEX "HabitEntry_userId_idx" ON "HabitEntry"("userId");

-- CreateIndex
CREATE INDEX "HabitEntry_logicalDate_idx" ON "HabitEntry"("logicalDate");

-- CreateIndex
CREATE INDEX "HabitEntry_userId_logicalDate_idx" ON "HabitEntry"("userId", "logicalDate");

-- CreateIndex
CREATE INDEX "SubvariableEntry_habitEntryId_idx" ON "SubvariableEntry"("habitEntryId");

-- CreateIndex
CREATE INDEX "SubvariableEntry_subvariableId_idx" ON "SubvariableEntry"("subvariableId");

-- CreateIndex
CREATE UNIQUE INDEX "SubvariableEntry_habitEntryId_subvariableId_key" ON "SubvariableEntry"("habitEntryId", "subvariableId");

-- CreateIndex
CREATE INDEX "AppSessionLog_userId_idx" ON "AppSessionLog"("userId");

-- CreateIndex
CREATE INDEX "AppSessionLog_timestamp_idx" ON "AppSessionLog"("timestamp");

-- CreateIndex
CREATE INDEX "UserEvent_userId_idx" ON "UserEvent"("userId");

-- CreateIndex
CREATE INDEX "UserEvent_eventType_idx" ON "UserEvent"("eventType");

-- CreateIndex
CREATE INDEX "UserEvent_userId_timestamp_idx" ON "UserEvent"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_slug_key" ON "Experiment"("slug");

-- CreateIndex
CREATE INDEX "Experiment_userId_idx" ON "Experiment"("userId");

-- CreateIndex
CREATE INDEX "Experiment_status_idx" ON "Experiment"("status");

-- CreateIndex
CREATE INDEX "Experiment_userId_status_idx" ON "Experiment"("userId", "status");

-- CreateIndex
CREATE INDEX "Experiment_protocolId_idx" ON "Experiment"("protocolId");

-- CreateIndex
CREATE INDEX "Experiment_slug_idx" ON "Experiment"("slug");

-- CreateIndex
CREATE INDEX "Assignment_experimentId_idx" ON "Assignment"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_experimentId_date_key" ON "Assignment"("experimentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Protocol_slug_key" ON "Protocol"("slug");

-- CreateIndex
CREATE INDEX "Protocol_slug_idx" ON "Protocol"("slug");

-- CreateIndex
CREATE INDEX "Protocol_isPublic_idx" ON "Protocol"("isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- AddForeignKey
ALTER TABLE "InsightsCache" ADD CONSTRAINT "InsightsCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "HabitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitTemplate" ADD CONSTRAINT "HabitTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subvariable" ADD CONSTRAINT "Subvariable_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitEntry" ADD CONSTRAINT "HabitEntry_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitEntry" ADD CONSTRAINT "HabitEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubvariableEntry" ADD CONSTRAINT "SubvariableEntry_habitEntryId_fkey" FOREIGN KEY ("habitEntryId") REFERENCES "HabitEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubvariableEntry" ADD CONSTRAINT "SubvariableEntry_subvariableId_fkey" FOREIGN KEY ("subvariableId") REFERENCES "Subvariable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSessionLog" ADD CONSTRAINT "AppSessionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_independentId_fkey" FOREIGN KEY ("independentId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

