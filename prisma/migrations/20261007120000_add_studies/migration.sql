-- Additive study infrastructure. Review and deploy with Prisma; never db push.
DO $$ BEGIN CREATE TYPE "StudyStatus" AS ENUM ('DRAFT', 'RECRUITING', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StudyRole" AS ENUM ('OWNER', 'ANALYST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Study" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "joinCode" TEXT NOT NULL,
  "status" "StudyStatus" NOT NULL DEFAULT 'DRAFT',
  "protocol" JSONB NOT NULL,
  "protocolHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Study_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Study_joinCode_key" ON "Study"("joinCode");

CREATE TABLE IF NOT EXISTS "StudyMember" (
  "id" TEXT NOT NULL,
  "studyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "StudyRole" NOT NULL DEFAULT 'ANALYST',
  CONSTRAINT "StudyMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudyMember_studyId_userId_key" ON "StudyMember"("studyId", "userId");
CREATE INDEX IF NOT EXISTS "StudyMember_userId_idx" ON "StudyMember"("userId");
DO $$ BEGIN ALTER TABLE "StudyMember" ADD CONSTRAINT "StudyMember_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "StudyMember" ADD CONSTRAINT "StudyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StudyParticipant" (
  "id" TEXT NOT NULL,
  "studyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pseudonym" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "outcomeHabitId" TEXT NOT NULL,
  "outcomeVariableId" TEXT NOT NULL,
  "interventionHabitId" TEXT NOT NULL,
  "assignments" JSONB NOT NULL,
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudyParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudyParticipant_experimentId_key" ON "StudyParticipant"("experimentId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudyParticipant_outcomeHabitId_key" ON "StudyParticipant"("outcomeHabitId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudyParticipant_outcomeVariableId_key" ON "StudyParticipant"("outcomeVariableId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudyParticipant_interventionHabitId_key" ON "StudyParticipant"("interventionHabitId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudyParticipant_studyId_userId_key" ON "StudyParticipant"("studyId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudyParticipant_studyId_pseudonym_key" ON "StudyParticipant"("studyId", "pseudonym");
CREATE INDEX IF NOT EXISTS "StudyParticipant_userId_idx" ON "StudyParticipant"("userId");
DO $$ BEGIN ALTER TABLE "StudyParticipant" ADD CONSTRAINT "StudyParticipant_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "StudyParticipant" ADD CONSTRAINT "StudyParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StudyConsent" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "protocolHash" TEXT NOT NULL,
  "consentText" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudyConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudyConsent_participantId_key" ON "StudyConsent"("participantId");
DO $$ BEGIN ALTER TABLE "StudyConsent" ADD CONSTRAINT "StudyConsent_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "StudyParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Access is mediated by the privileged server and its current membership checks.
-- Do not expose invite codes, identities, consent or observations through PostgREST.
ALTER TABLE "Study" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudyMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudyParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudyConsent" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "Study", "StudyMember", "StudyParticipant", "StudyConsent" FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
