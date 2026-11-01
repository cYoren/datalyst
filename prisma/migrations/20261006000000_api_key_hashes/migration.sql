-- Idempotent so it can be applied by hand (psql or the Supabase SQL editor):
-- prisma/migrations/migration_lock.toml still says sqlite, so `prisma migrate deploy`
-- cannot run against the Postgres database until a Postgres baseline exists.

-- DropIndex
DROP INDEX IF EXISTS "ApiKey_key_idx";

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "keyHash" TEXT,
ADD COLUMN IF NOT EXISTS "prefix" TEXT,
ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "scopes" TEXT[] DEFAULT ARRAY['read', 'write']::TEXT[],
ALTER COLUMN "key" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");


-- Backfill: hash existing manually issued keys so they keep working through the
-- hash lookup. The legacy plaintext column is left in place for rollback safety;
-- a follow-up migration can null it once this release is confirmed.
UPDATE "ApiKey"
SET "keyHash" = encode(sha256(convert_to("key", 'UTF8')), 'hex'),
    "prefix" = left("key", 10)
WHERE "key" IS NOT NULL AND "keyHash" IS NULL;
