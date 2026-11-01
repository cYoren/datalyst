-- Datalyst Database Schema for Supabase
-- Safe migration that handles existing objects
-- Run this in Supabase SQL Editor

-- Create enums (skip if they exist)
DO $$ BEGIN
  CREATE TYPE "SubvariableType" AS ENUM ('NUMERIC', 'SCALE_0_10', 'BOOLEAN', 'CATEGORY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventType" AS ENUM (
    'HABIT_CREATED',
    'HABIT_UPDATED',
    'HABIT_DELETED',
    'ENTRY_CREATED',
    'ENTRY_UPDATED',
    'ENTRY_DELETED',
    'SUBVARIABLE_CREATED',
    'SUBVARIABLE_UPDATED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ScheduleType" AS ENUM ('DAILY', 'WEEKLY', 'ADHOC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TimeBlock" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GoalDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER', 'NEUTRAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExperimentStatus" AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create User table
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT,
  "onboardingCompleted" BOOLEAN DEFAULT false NOT NULL,
  "timezone" TEXT DEFAULT 'UTC' NOT NULL,
  "locale" TEXT DEFAULT 'en-US' NOT NULL,
  "theme" "Theme" DEFAULT 'SYSTEM' NOT NULL,
  "healthDataConsent" BOOLEAN DEFAULT false NOT NULL,
  "healthDataConsentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "healthDataConsent" BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "healthDataConsentAt" TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "timezone" SET DEFAULT 'UTC';
ALTER TABLE "User" ALTER COLUMN "locale" SET DEFAULT 'en-US';

CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

-- Create HabitTemplate table
CREATE TABLE IF NOT EXISTS "HabitTemplate" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT DEFAULT '#3b82f6' NOT NULL,
  "icon" TEXT DEFAULT 'ðŸŽ¯' NOT NULL,
  "defaultSchedule" TEXT DEFAULT '{}' NOT NULL,
  "subvariableTemplate" TEXT DEFAULT '[]' NOT NULL,
  "useCount" INTEGER DEFAULT 0 NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "HabitTemplate_userId_idx" ON "HabitTemplate"("userId");
CREATE INDEX IF NOT EXISTS "HabitTemplate_userId_name_idx" ON "HabitTemplate"("userId", "name");
CREATE INDEX IF NOT EXISTS "HabitTemplate_userId_useCount_idx" ON "HabitTemplate"("userId", "useCount");

-- Create Habit table
CREATE TABLE IF NOT EXISTS "Habit" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "templateId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT DEFAULT '#3b82f6' NOT NULL,
  "icon" TEXT DEFAULT 'ðŸŽ¯' NOT NULL,
  "scheduleType" "ScheduleType" DEFAULT 'DAILY' NOT NULL,
  "scheduleDays" INTEGER[] DEFAULT '{}'::INTEGER[] NOT NULL,
  "timeBlock" "TimeBlock" DEFAULT 'ANYTIME' NOT NULL,
  "rank" INTEGER DEFAULT 0 NOT NULL,
  "schedule" TEXT DEFAULT '{}' NOT NULL,
  "archived" BOOLEAN DEFAULT false NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  FOREIGN KEY ("templateId") REFERENCES "HabitTemplate"("id") ON DELETE SET NULL
);

ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "scheduleType" "ScheduleType" DEFAULT 'DAILY' NOT NULL;
ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "scheduleDays" INTEGER[] DEFAULT '{}'::INTEGER[] NOT NULL;
ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "timeBlock" "TimeBlock" DEFAULT 'ANYTIME' NOT NULL;
ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "rank" INTEGER DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "Habit_userId_idx" ON "Habit"("userId");
CREATE INDEX IF NOT EXISTS "Habit_userId_archived_idx" ON "Habit"("userId", "archived");
CREATE INDEX IF NOT EXISTS "Habit_templateId_idx" ON "Habit"("templateId");

-- Create Subvariable table
CREATE TABLE IF NOT EXISTS "Subvariable" (
  "id" TEXT PRIMARY KEY,
  "habitId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "SubvariableType" NOT NULL,
  "unit" TEXT,
  "prompt" TEXT,
  "goalDirection" "GoalDirection" DEFAULT 'NEUTRAL' NOT NULL,
  "metadata" TEXT DEFAULT '{}' NOT NULL,
  "order" INTEGER DEFAULT 0 NOT NULL,
  "active" BOOLEAN DEFAULT true NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE
);

ALTER TABLE "Subvariable" ADD COLUMN IF NOT EXISTS "prompt" TEXT;
ALTER TABLE "Subvariable" ADD COLUMN IF NOT EXISTS "goalDirection" "GoalDirection" DEFAULT 'NEUTRAL' NOT NULL;

CREATE INDEX IF NOT EXISTS "Subvariable_habitId_idx" ON "Subvariable"("habitId");
CREATE INDEX IF NOT EXISTS "Subvariable_habitId_active_idx" ON "Subvariable"("habitId", "active");

-- Create HabitEntry table
CREATE TABLE IF NOT EXISTS "HabitEntry" (
  "id" TEXT PRIMARY KEY,
  "habitId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "logicalDate" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "HabitEntry_habitId_idx" ON "HabitEntry"("habitId");
CREATE INDEX IF NOT EXISTS "HabitEntry_userId_idx" ON "HabitEntry"("userId");
CREATE INDEX IF NOT EXISTS "HabitEntry_logicalDate_idx" ON "HabitEntry"("logicalDate");
CREATE INDEX IF NOT EXISTS "HabitEntry_userId_logicalDate_idx" ON "HabitEntry"("userId", "logicalDate");

-- Create SubvariableEntry table
CREATE TABLE IF NOT EXISTS "SubvariableEntry" (
  "id" TEXT PRIMARY KEY,
  "habitEntryId" TEXT NOT NULL,
  "subvariableId" TEXT NOT NULL,
  "numericValue" DOUBLE PRECISION NOT NULL,
  "rawValue" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY ("habitEntryId") REFERENCES "HabitEntry"("id") ON DELETE CASCADE,
  FOREIGN KEY ("subvariableId") REFERENCES "Subvariable"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SubvariableEntry_habitEntryId_idx" ON "SubvariableEntry"("habitEntryId");
CREATE INDEX IF NOT EXISTS "SubvariableEntry_subvariableId_idx" ON "SubvariableEntry"("subvariableId");

-- Create AppSessionLog table
CREATE TABLE IF NOT EXISTS "AppSessionLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "origin" TEXT DEFAULT 'web' NOT NULL,
  "duration" INTEGER,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AppSessionLog_userId_idx" ON "AppSessionLog"("userId");
CREATE INDEX IF NOT EXISTS "AppSessionLog_timestamp_idx" ON "AppSessionLog"("timestamp");

-- Create UserEvent table
CREATE TABLE IF NOT EXISTS "UserEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "eventType" "EventType" NOT NULL,
  "entityId" TEXT,
  "metadata" TEXT DEFAULT '{}' NOT NULL,
  "timestamp" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "UserEvent_userId_idx" ON "UserEvent"("userId");
CREATE INDEX IF NOT EXISTS "UserEvent_eventType_idx" ON "UserEvent"("eventType");
CREATE INDEX IF NOT EXISTS "UserEvent_userId_timestamp_idx" ON "UserEvent"("userId", "timestamp");

-- Create InsightsCache table
CREATE TABLE IF NOT EXISTS "InsightsCache" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "InsightsCache_userId_idx" ON "InsightsCache"("userId");

-- Create Experiment table
CREATE TABLE IF NOT EXISTS "Experiment" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "hypothesis" TEXT,
  "independentId" TEXT NOT NULL,
  "dependentId" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "status" "ExperimentStatus" DEFAULT 'PLANNING' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  FOREIGN KEY ("independentId") REFERENCES "Habit"("id") ON DELETE CASCADE,
  FOREIGN KEY ("dependentId") REFERENCES "Habit"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Experiment_userId_idx" ON "Experiment"("userId");
CREATE INDEX IF NOT EXISTS "Experiment_status_idx" ON "Experiment"("status");
CREATE INDEX IF NOT EXISTS "Experiment_userId_status_idx" ON "Experiment"("userId", "status");

-- Enable Row Level Security (RLS)
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Habit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HabitTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subvariable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HabitEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubvariableEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSessionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsightsCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Experiment" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own data" ON "User";
DROP POLICY IF EXISTS "Users can update own data" ON "User";
DROP POLICY IF EXISTS "Users can view own habits" ON "Habit";
DROP POLICY IF EXISTS "Users can create own habits" ON "Habit";
DROP POLICY IF EXISTS "Users can update own habits" ON "Habit";
DROP POLICY IF EXISTS "Users can delete own habits" ON "Habit";
DROP POLICY IF EXISTS "Users can manage own templates" ON "HabitTemplate";
DROP POLICY IF EXISTS "Users can manage own entries" ON "HabitEntry";
DROP POLICY IF EXISTS "Users can manage own session logs" ON "AppSessionLog";
DROP POLICY IF EXISTS "Users can manage own events" ON "UserEvent";
DROP POLICY IF EXISTS "Users can view subvariables of own habits" ON "Subvariable";
DROP POLICY IF EXISTS "Users can manage subvariables of own habits" ON "Subvariable";
DROP POLICY IF EXISTS "Users can manage own subvariable entries" ON "SubvariableEntry";
DROP POLICY IF EXISTS "Users can manage own insights cache" ON "InsightsCache";
DROP POLICY IF EXISTS "Users can manage own experiments" ON "Experiment";

-- Create RLS policies
CREATE POLICY "Users can view own data" ON "User"
  FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY "Users can update own data" ON "User"
  FOR UPDATE USING (auth.uid()::text = id);

CREATE POLICY "Users can view own habits" ON "Habit"
  FOR SELECT USING (auth.uid()::text = "userId");

CREATE POLICY "Users can create own habits" ON "Habit"
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "Users can update own habits" ON "Habit"
  FOR UPDATE USING (auth.uid()::text = "userId");

CREATE POLICY "Users can delete own habits" ON "Habit"
  FOR DELETE USING (auth.uid()::text = "userId");

CREATE POLICY "Users can manage own templates" ON "HabitTemplate"
  FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "Users can manage own entries" ON "HabitEntry"
  FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "Users can manage own session logs" ON "AppSessionLog"
  FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "Users can manage own events" ON "UserEvent"
  FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "Users can view subvariables of own habits" ON "Subvariable"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Habit"
      WHERE "Habit"."id" = "Subvariable"."habitId"
      AND "Habit"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage subvariables of own habits" ON "Subvariable"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "Habit"
      WHERE "Habit"."id" = "Subvariable"."habitId"
      AND "Habit"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage own subvariable entries" ON "SubvariableEntry"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "HabitEntry"
      WHERE "HabitEntry"."id" = "SubvariableEntry"."habitEntryId"
      AND "HabitEntry"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage own insights cache" ON "InsightsCache"
  FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "Users can manage own experiments" ON "Experiment"
  FOR ALL USING (auth.uid()::text = "userId");

-- Auth user creation is handled by the app (/auth/callback); remove any legacy trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Database migration completed successfully!';
END $$;
