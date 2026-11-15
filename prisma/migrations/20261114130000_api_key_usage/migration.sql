-- Durable rate-limit counters (ROADMAP.md S2). One row per key per minute, so two isolates
-- share one limit instead of each counting in process memory.

CREATE TABLE IF NOT EXISTS "ApiKeyUsage" (
  "id" TEXT PRIMARY KEY,
  "apiKeyId" TEXT NOT NULL REFERENCES "ApiKey"("id") ON DELETE CASCADE,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKeyUsage_apiKeyId_windowStart_key" ON "ApiKeyUsage"("apiKeyId", "windowStart");

ALTER TABLE "ApiKeyUsage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ApiKeyUsage" FROM PUBLIC;
