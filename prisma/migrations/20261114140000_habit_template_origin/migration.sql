-- Remember which template a tracker came from (ROADMAP.md W1). A tracker's name is a label the
-- person can edit; the template is what tells the app which questions belong to it.

ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "templateOrigin" TEXT;
