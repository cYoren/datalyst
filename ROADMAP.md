# Roadmap

Status: current (2026-11-14)

`PRODUCT.md` is the direction. This file is the work order: what to build, in
what order, and how to tell it is done. The AI platform contract that used to
live here is now `docs/AI-PLATFORM.md`; it still governs how AI work is done,
and no longer decides what is built next.

## How to use this

- Every item has an ID. Put it in the branch name and the PR title.
- **P0** first. **P1** next. **P2** only when you are already in the file.
- "Accept" is the test of done. If you cannot meet it, say so in the PR.
- One concern per PR. Read `AGENTS.md` for the repository rules.
- UI work: check 360, 390 and 412 px, plus the Daily Check-in and Data flows.

## What this is based on

`main` at `9bfe83c`, built as the self-hosted image and walked as a new
person on 2026-11-14 (onboarding, first check-in, dashboard, Data, Lab, a new
experiment, Levels, studies, Settings), plus the live landing page and the
code. Screenshots: `~/Work/datalyst-audit-2026-11-14/` (local evidence, not
in the repository).

The honest summary: **the engine is strong and the product is spread thin.**
Statistics, experiments, health import, widgets, an MCP server, studies and a
self-hosted build all exist. But there is no paid plan while the site says
there is one, a new person's first day is ten questions under a "0 / 14 days"
bar, the Lab (the thing that makes Datalyst different) is in a profile menu
and tells people it "proves causation", a template that should start an
experiment opens an empty form, and no other app can connect without someone
pasting an account-wide key. Five identities are in the docs and the code.
The work below picks one and finishes it.

## Milestone 1: true and trustworthy

Small, and before anything else, because each one is a promise the product
breaks today.

**T1. Remove the paid plan that does not exist (P0).** `src/lib/faq.ts` and
`src/app/llms.txt/route.ts` say "The paid plan is for people who log every
day and want the full history, more trackers and more experiments." No plan,
price or billing code exists. Say what is true: free today. Also check
`ai-policy.ts`, the landing page and both store listings for the same claim.
Accept: no text in the app, the site, the agent files or the listings
mentions a plan until M5 ships; a test fails if "paid plan" returns before a
plan exists.

**T2. The self-hosted build sends nothing to us (P0).**
`CloudflareAnalytics.tsx` falls back to datalyst.one's analytics token, so
every self-hosted install loads Cloudflare's beacon and reports to our
account. In self-hosted mode the component renders nothing unless the
operator sets their own token. Accept: a test renders the layout with
`NEXT_PUBLIC_DATALYST_SELF_HOSTED=1` and finds no third-party script; the
README says so in one line.

**T3. Stop saying "prove causation" (P0).** `lab/page.tsx` and
`about/page.tsx`. A randomized experiment on one person supports a conclusion
about that person; say that. Accept: the phrases "prove", "proves" and
"proven" do not appear in user-facing copy; a test greps for them.

**T4. One vocabulary (P1).** The Lab says "Test correlations between your
protocols" and "Select a protocol…" where the product's word is Tracker.
User-facing words are Tracker, Check-in, Data, Lab, Experiment, Pattern.
"Protocol" is for studies only; "habit" stays in code. Accept: a test greps
user-facing strings in `(app)/` for the retired words.

**T5. Things that should not be on a consumer's screen (P1).** "System Logs"
in the profile menu; the "Researcher studies" card as the first thing in the
Lab; Levels offering "Nutrition · Meals" as a dose and reporting "0 MEALS
STILL IN YOU". Hide Logs outside self-hosted, move studies to the bottom of
the Lab, and let Levels list only trackers marked as a dose. Accept:
screenshots.

**T6. The sample data link (P1).** In the audit, "Explore with 30 days of
sample data" on onboarding left the dashboard unchanged for an account that
already had trackers, with no message. Find out what it does in that state
and make it either work or say why not.

## Milestone 2: the first week pays

The activation number is the second day of check-ins. Today's first day works
against it.

**W1. A smaller first day (P0).** The preselected Gut pack creates four
trackers and ten daily questions. Every pack gets a "start" set of at most
five questions: the symptom, and the two or three most likely triggers. The
rest of the pack is offered after the third day of check-ins. Accept: no
default first check-in has more than five questions; the activation report
is run before and after and both numbers are in the PR.

Status 2026-11-14: the first half is met (the cap is in the code and tested).
The second half is only half met, and honestly: the report was never run
*before* the change, so there is no "before" to compare. The first numbers
taken after it, on 19 accounts, are the baseline the next change is measured
against — 63% created a tracker, 58% saved a check-in, 32% logged on two
days, 21% on seven, 21% created an experiment, median 0.9 hours to the first
check-in. `docs/activation-2026-11-14.md` records the command and the output.

**W2. The check-in comes first (P0).** On the dashboard the "Insights:
Building your dataset · 0 / 14 days · 0%" card sits above the check-in for a
new person. Until there is an answer to show, the check-in is the first thing
on the screen and the progress note is one quiet line under it. Accept:
screenshots at 360, 390, 412 for day 0, day 1 and a day with a pattern.

**W3. Replace the 14-day promise (P0).** Decided here, closing
`OPEN-DECISIONS.md` §1: onboarding stops promising an answer "after 14 days".
It says what is true: you see your week from day one, and a pattern appears
when two things have been logged together on enough days. The dashboard
counter becomes per pair, for the pairs closest to ready: "Sleep and
headache: 6 more days together." Accept: no global day counter remains; the
readiness number comes from the same rule the correlation engine uses, in a
shared function with a test.

**W4. Something back on days one, three and seven (P0).** No statistics
claimed, only description, each with its count:

- Day 1: "Logged. Tomorrow at the same time?" with the reminder offer.
- Day 3: your three days side by side for the main symptom.
- Day 7: a week summary: best and worst day, averages, and one descriptive
  line such as "On the 3 days you slept under 6 h, headache averaged 6.3; on
  the other 4 it averaged 3.1 (7 days, too few to call a pattern)."

Deterministic copy, no AI needed, AI explanation optional on top. Accept:
fixtures for each day render the expected card; the day-7 line always carries
its n and its caution.

**W5. The reminder at the moment it makes sense (P1).** Offered after the
first saved check-in, at the hour of that check-in. Accept: a test.

**W6. Widget device pass (P0 for the next store build).** One-tap logging has
never run on hardware. The checklist is in `docs/native-surfaces.md`. Needs
Gus or the Mac.

## Milestone 3: answers people can use

**A1. The Lab is a main tab (P0).** Bottom navigation becomes Today, Data,
Lab, Profile, with the add button kept. The label is "Lab", not "Lab
(Advanced)". `AGENTS.md` is updated in the same PR. Accept: screenshots; the
mobile e2e suite passes.

**A2. A template starts an experiment (P0).** "Caffeine → Focus" today opens
an empty form listing the person's unrelated trackers. A template creates the
trackers it needs (after showing them), fills the form, and leaves one
decision: when to start. Accept: from a fresh account, a randomized
experiment is running in under a minute from the template card.

**A3. Verdicts in plain words (P0).** Experiment results and patterns lead
with one of three readings, shared with Advanced Dual N-Back: a clear change,
within noise, not enough data yet. The numbers (effect size, interval, p,
posterior) sit under it. While an experiment is running, the screen shows
what is still needed and does not show the difference. Accept: fixtures for a
null effect, a large effect and an unfinished experiment read correctly; no
result screen leads with a p value.

**A4. From a pattern to a test in one tap (P1).** Every pattern card has
"Test it", which opens A2's flow with both variables filled.

**A5. A result worth showing (P1).** A finished experiment renders as one
image: the question, the days, the verdict, the number with its interval.
The `/share/[slug]` page already exists; this is the image and the share
button. Null results included.

**A6. Settings in sections (P1).** One long page today, opening with
"Connect your AI" and a Cloud card. Sections in this order: Account,
Reminders, Health import, Connected apps and assistants, Privacy and AI,
Export and import, Plan, Danger zone.

## Milestone 4: the service others build on

**S1. Connected apps (P0).** Build `docs/CONNECTED-APPS.md` exactly: the
registry, the connect screen with PKCE, app-limited keys, `/api/v1/app/*`,
`ApiKeyEvent`, Settings → Connected apps, sources on entries, measured
variables, the Lab template for a measured outcome. Order:

1. Schema and service rule (`appId`, `readableSubvariableIds`,
   `createdByAppId`, `ApiKeyEvent`), with the test that an app key is refused
   everywhere else.
2. `/api/v1/app/*` and OpenAPI.
3. The connect screen and token exchange.
4. Settings → Connected apps, and the "Measured by" label in Data.
5. The Lab template and the one-line pointer to the app.

Accept: the four "Done means" checks in that document.

**S2. A rate limit that holds (P0).** Limits are counted in process memory,
per isolate. Move the counter to the database or the edge for MCP, the app
API and AI runs. Accept: two instances share one limit in a test.

**S3. A record of what a key did (P1).** `ApiKeyEvent` from S1, written for
assistant keys too, readable in Settings.

**S4. Service readiness (P0 before a plan is sold).** Written down and
tested once, in `docs/PRIVACY_OPERATIONS.md` or a new runbook: a restore from
backup onto a scratch database; an uptime check on `/api/health`; who is
paged and how; the database tier (a free tier that pauses is not a service
people pay for); error reporting with no values in it. Accept: the runbook
exists and the restore drill has a date on it.

Met 2026-11-14: the runbook is `docs/SERVICE_OPERATIONS.md`, and the drill was
run against a scratch database in the production instance — 517 KB dump,
42 s to dump, 4 s to restore, 19 accounts and 533 check-ins recovered
identically, `check:migrations` and `verify.sql` clean, and an account with 126
check-ins rendered through the real services. The log has the date, the numbers
and the one finding: a restore into a fresh Supabase database needs
`--schema=public --no-privileges`, because the project ships its own `auth`
schema and keeps app types from a half-finished attempt.

**S5. Advanced Dual N-Back, end to end (P1).** Once S1 is merged, that app's
1.3 work can start. Datalyst's part is done when its device check passes.

## Milestone 5: the plan

Blocked on one decision by Gus (`OPEN-DECISIONS.md`): the price and the
billing route. Do not start the billing code before it is made. Everything
else can be prepared:

**M1. Entitlement (P0).** `User.plan` and one function, `can(user, feature)`,
used by every gate. Self-hosted always answers yes. Free and Plus as
`PRODUCT.md` defines them. Accept: a table-driven test of every feature
against both plans and self-hosted.

**M2. Gates at the moment of intent (P0).** A locked feature is visible,
tappable, and opens one screen that names the thing reached for, what Plus
adds in three lines, and the price from the store or the processor. Never on
the dashboard, never before the first check-in. Nobody loses a feature they
are already using: existing accounts keep what they have (record the cut-off
date in the PR).

**M3. Billing (P0, after the decision).** In-app purchase on iOS and Android,
card on the web, one entitlement in the database, restore, cancel, and the
store review notes.

**M4. Say it everywhere at once (P0).** FAQ, agent files, landing, both
store listings, README, in the PR that turns the plan on. T1's test flips.

## After these

- Health import as the default first step for people who have a phone full
  of data: connect health, pick one symptom, and patterns can start on data
  that already exists.
- AI next-best observation and the experiment planner (`docs/AI-PLATFORM.md`
  phases 4), once A2 to A4 show which step people stall on.
- Number and scale logging from the widget.
- Other first-party apps as connected apps, one at a time.

## Parked, and what would reopen it

| Idea | Reopens when |
| --- | --- |
| AI Protocol Builder in onboarding | The activation report shows people stalling on choosing trackers, not on the first check-in. It may never stand before the first check-in. |
| Studies: protocol editor, power hint, report (`docs/studies-roadmap.md`) | A researcher is running a real study and asks |
| Server-to-server study enrolment | The light path has hosted real studies |
| On-chain attestations beyond what ships | Someone needs to verify a result and cannot |
| Apple Watch app | The phone widgets have passed on devices and people use them |
| Desktop app with a local database, sync (`tasks/local-first-plan.md`) | Self-hosted users ask for it in numbers, or Cloud needs offline logging |
| Third-party connected apps | A first-party app has run on the contract for a release |
| Memory layer, cost dashboards (`docs/AI-PLATFORM.md` phase 5) | AI usage is large enough to need them |
| Microsoft Store, more browser stores | Never a priority; do it if it is free |

## Out

A general chat assistant. Social feeds, communities, leaderboards. Team
workspaces. Diagnosis or treatment advice. Selling or sharing data. Gating a
person's own history.

## Numbers

From `npm run activation:report` and the store consoles, monthly:

| Number | Why |
| --- | --- |
| Signed up → first check-in | Onboarding works |
| First check-in → second day | The first day was worth repeating |
| Second day → seventh day | The first week paid |
| People with a pattern or a finished experiment | The north star |
| Store installs, by listing | Whether "Symptom Tracker" found people. The four-week read of the 2026-10-16 repositioning is due now; run it before touching the listing again |

All aggregate. No per-person analytics, no values, nothing new on the
check-in path.
