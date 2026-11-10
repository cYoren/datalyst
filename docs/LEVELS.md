Status: current

# Levels

`/levels` answers one question: how much of a dose is still in you at bedtime.

## Scope

One substance at a time, one tracked number at a time. The panel reads `NUMERIC`
subvariables and their entries, and treats **each entry as one dose taken at that
entry's `timestamp`**. There is no per-cup schema and no migration: a user who logs
three coffees as three entries gets three curves; a user who logs one daily total
gets one curve, which is why the template and the log button exist.

## Logging a dose

`Log <amount> at HH:MM` in the panel POSTs `/api/entries` (create, not quick) so the
entry is **appended** at the current timestamp. `POST /api/entries/quick` cannot be
used here: it upserts one value per variable per day and would overwrite the
previous cup.

A tracker that works this way marks its number subvariable with
`metadata.aggregation = 'sum'`. The Data page then draws one row per day with the
sum of that day's doses (`src/lib/dailyChart.ts`, tested) instead of one point per
entry with a repeated date label. The `caffeine` template ships in this shape
(`Caffeine`, mg, sum). Trackers created before the change keep their shape.

The Daily Check-in and the AI quick log use `POST /api/entries/quick`, which upserts
one value per variable per day. For a `sum` variable it now appends instead
(`EntryService.quickEntry`), so a check-in adds a dose at the time you tap it and
never overwrites the cup before it. Correct a mistake by deleting that entry on the
Data page, not by editing the total.

## Model

`src/lib/levels.ts` holds all of it, pure and tested (`src/lib/levels.test.ts`).

- One compartment, instant absorption, first-order elimination:
  `level(t) = amount * 2^(-(t - dose)/halfLife)`.
- Half-life comes from a preset (`HALF_LIFE_PRESETS`), preselected by tracker name
  and editable in the UI. Each preset carries the adult range, shown next to the
  control so a single number is never read as the user's own metabolism.
- Instant absorption is deliberate: a 30 to 60 min absorption phase would smooth the
  peak and buy precision this app cannot verify.
- Alcohol is first-order here, which it is not (zero order, ~0.15 g/L per hour). It
  is in the list because the curve shape is close enough for a bedtime question;
  do not extend its claims.

## Day window

The window opens at 04:00 local (`DAY_OPEN_MINUTES`) so one late night stays one
day, and runs 24 h. Doses from the previous day still count in the sum, because 24 h
later a little is still in you.

## Settings

Tracker, half-life preset, bedtime and floor live in `localStorage`
(`datalyst.levels.settings`), not in the database. They are per-device display
settings; persisting them per user would need a subvariable metadata write, which
the habit PATCH path does not safely support for a partial update.

## Numbers on screen

- Peak: highest total in the window and when.
- At bed: total at the bedtime minute, against the floor.
- Clears by: first minute at or after now that drops under the floor, capped at the
  end of the window (shows a dash instead of a time past it).
- Last dose by: `bedtime - halfLife * log2(amount / floor)` for the selected plan
  amount, so the panel teaches the same answer the curve gives.
