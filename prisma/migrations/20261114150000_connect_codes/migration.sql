-- One-time authorization codes for connected apps (docs/CONNECTED-APPS.md). The code is stored
-- hashed, lives 60 seconds, and is consumed exactly once by the token exchange.

CREATE TABLE IF NOT EXISTS "ConnectCode" (
  "id" TEXT PRIMARY KEY,
  "codeHash" TEXT NOT NULL UNIQUE,
  "appId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "redirectUri" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "readableSubvariableIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConnectCode_userId_idx" ON "ConnectCode"("userId");

ALTER TABLE "ConnectCode" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ConnectCode" FROM PUBLIC;
