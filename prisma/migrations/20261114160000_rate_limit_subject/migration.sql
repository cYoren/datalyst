-- One counter table for every kind of subject (ROADMAP.md S2): a key's minute, or an AI run per
-- user and capability. The API key column becomes optional so a subject needs no placeholder row.

ALTER TABLE "ApiKeyUsage" ALTER COLUMN "apiKeyId" DROP NOT NULL;
ALTER TABLE "ApiKeyUsage" ADD COLUMN IF NOT EXISTS "subject" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKeyUsage_subject_windowStart_key" ON "ApiKeyUsage"("subject", "windowStart");
