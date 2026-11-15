-- A connected app's trackers are identified by the app's own key, not by the person's display
-- name, so renaming "Working memory" does not make a reconnect create a second tracker.

ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "appTrackerKey" TEXT;
