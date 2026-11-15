-- Connected apps (docs/CONNECTED-APPS.md). Additive and idempotent; apply before deploying
-- the /api/v1/app routes.
--
-- A key with an appId is narrower than an account key: app:read / app:write only, reads
-- limited to the variables the person ticked, writes limited to trackers the app created.

ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "appId" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "readableSubvariableIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS "ApiKey_appId_idx" ON "ApiKey"("appId");

ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "createdByAppId" TEXT;

-- What a key did, never what it saw.
CREATE TABLE IF NOT EXISTS "ApiKeyEvent" (
  "id" TEXT PRIMARY KEY,
  "apiKeyId" TEXT NOT NULL REFERENCES "ApiKey"("id") ON DELETE CASCADE,
  "appId" TEXT,
  "action" TEXT NOT NULL,
  "habitId" TEXT,
  "logicalDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ApiKeyEvent_apiKeyId_createdAt_idx" ON "ApiKeyEvent"("apiKeyId", "createdAt");

-- Server-owned. A browser role must not be able to read another account's key activity.
ALTER TABLE "ApiKeyEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ApiKeyEvent" FROM PUBLIC;
