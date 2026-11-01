-- Apply manually after review; legacy history is SQLite. No existing data is changed.
CREATE TABLE IF NOT EXISTS "ExperimentAttestation" (
  "id" TEXT PRIMARY KEY,
  "experimentId" TEXT NOT NULL REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "snapshot" JSONB NOT NULL,
  "dataHash" TEXT NOT NULL,
  "uid" TEXT,
  "txHash" TEXT,
  "proof" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExperimentAttestation_experimentId_kind_key" ON "ExperimentAttestation"("experimentId", "kind");
ALTER TABLE "ExperimentAttestation" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "ExperimentAttestation" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "ExperimentAttestation" FROM authenticated;
  END IF;
END $$;
