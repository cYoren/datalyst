# Lessons Learned

## Project: Datalyst N=1 Experimentation Platform

### 2026-02-01 — Phase 1 Fixes
- **Pattern:** Several "bugs" were already fixed when I went to edit them (washout labels, sampleVariance, parseISO, date param). Always read the current file state before assuming a bug still exists.
- **Rule:** Always `Read` before `Edit`. Never assume file contents from earlier in the conversation are still current.
- **Pattern:** The timezone fix needed validation (±2 day window) to prevent abuse — don't just blindly trust client input at API boundaries.
- **Rule:** Any client-provided value used in DB queries must be validated server-side.

### 2026-02-01 — Phase 2 Implementation
- **Bug found:** `analysisParams` is a JSON `String` in Prisma but was cast directly to `Record<string, any>` without `JSON.parse()`. Config values were silently ignored. Always parse JSON string fields from the DB.
- **Bug found:** API returned `adaptationPeriod` (nonexistent field) instead of `washoutPeriod` (actual schema field). The `(experiment as any)` casts hid this. Avoid `as any` — regenerate the Prisma client instead.
- **Pattern:** Stacking multiple conditional warning banners creates a noisy UI. Group related warnings into a single collapsible section with a summary line.
- **Rule:** When the backend returns new optional fields, keep the frontend simple — hide detail behind progressive disclosure (collapsed by default).
