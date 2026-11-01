-- Synthetic values only, loaded solely by the disposable PostgreSQL smoke test.
INSERT INTO "User" (id,email,name,"healthDataConsent","updatedAt") VALUES
  ('legacy-owner','legacy-owner@synthetic.invalid','Synthetic legacy owner',true,'2026-01-01'),
  ('legacy-other','legacy-other@synthetic.invalid','Synthetic other account',false,'2026-01-01');
INSERT INTO "Habit" (id,"userId",name,"updatedAt") VALUES
  ('legacy-independent','legacy-owner','Legacy routine','2026-01-01'),
  ('legacy-outcome','legacy-owner','Legacy outcome','2026-01-01');
INSERT INTO "Subvariable" (id,"habitId",name,type,unit,"updatedAt") VALUES
  ('legacy-value','legacy-outcome','Legacy value','NUMERIC','points','2026-01-01');
INSERT INTO "HabitEntry" (id,"habitId","userId","logicalDate",note,"updatedAt") VALUES
  ('legacy-entry','legacy-outcome','legacy-owner','2026-01-01','Synthetic private note must survive','2026-01-01');
INSERT INTO "SubvariableEntry" (id,"habitEntryId","subvariableId","numericValue","rawValue") VALUES
  ('legacy-measurement','legacy-entry','legacy-value',7,'Synthetic raw value');
INSERT INTO "InsightsCache" (id,"userId",data,"expiresAt") VALUES
  ('legacy-cache','legacy-owner','{"synthetic":"existing-correlation"}','2030-01-01');
INSERT INTO "ApiKey" (id,key,name,"userId") VALUES
  ('legacy-key','dl_synthetic_legacy_key_only','Synthetic legacy key','legacy-owner');
INSERT INTO "Protocol" (id,slug,name,"independentTemplate","dependentTemplate","updatedAt") VALUES
  ('legacy-protocol','synthetic-legacy','Synthetic legacy protocol','{}','{}','2026-01-01');
INSERT INTO "Experiment" (id,"userId",name,hypothesis,"independentId","dependentId","startDate","endDate",status,"protocolId","updatedAt") VALUES
  ('legacy-experiment','legacy-owner','Synthetic completed trial','Synthetic hypothesis','legacy-independent','legacy-outcome','2026-01-01','2026-01-14','COMPLETED','legacy-protocol','2026-01-01');
INSERT INTO "Assignment" (id,"experimentId",date,condition,"blockIndex") VALUES
  ('legacy-assignment','legacy-experiment','2026-01-01','A',0);
CREATE TABLE "_prisma_migrations" (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, migration_name TEXT NOT NULL, finished_at TIMESTAMP(3));
INSERT INTO "_prisma_migrations" VALUES ('synthetic-history','synthetic-checksum-do-not-rewrite','20251123000416_init','2026-01-01');
