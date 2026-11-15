# Datalyst

Status: current. Canonical product direction, written 2026-11-14. Where any
other doc disagrees with this one, this one wins and the other doc is wrong.
`ROADMAP.md` is the work order that follows from it.

## What it is

**The place where your day is recorded, and the service that tells you what
affects what.**

A person logs what they do and how they feel, or lets their phone, their AI
assistant and their other apps log it for them. Datalyst finds what moves
together, lets them test one change at a time, and answers in plain words.

It is three layers, and every piece of work belongs to exactly one:

1. **Capture.** Getting a day into Datalyst with almost no effort.
2. **Answers.** Turning that record into something a person can act on.
3. **Service.** Accounts, the API, connected apps, the paid plan, and the
   operations that make it something others can build on.

## Who it is for

One job: **"I want to find out what affects how I feel or perform."**

Two kinds of people have that job and use different words for it:

- **People with a symptom**: migraine, gut, pain, sleep, mood. This is the
  store positioning ("Symptom Tracker") and it stays.
- **People who test things on themselves**: caffeine, training, supplements,
  focus. They arrive from the open-source repository, from AI assistants, and
  from Advanced Dual N-Back.

Same product, same loop, two front doors. We do not build two apps.

Researchers running multi-person studies are **not** the audience we build
for next. What ships for them stays and is kept working. It gets new work
when a real researcher is using it and asks.

## North star

**People who got an answer.** A person counts when they have seen a pattern
backed by enough paired days, or read the verdict of a finished experiment.
Logging days, streaks and AI calls are inputs, not the goal.

The number before it, because nothing else can happen without it: **a second
day of check-ins.** `npm run activation:report` already measures it.

## The loop

Log → see what lines up → test one change → read the answer → keep or drop
the habit.

## How we decide what to build

A piece of work earns its place only if it does one of these:

1. makes a day **cheaper to record**,
2. makes an answer **arrive sooner or be more trustworthy**, or
3. makes Datalyst **safer or easier to build on**.

Anything else waits, however good it is. The product already has more
surfaces than users; the next year is about depth on the loop, not a wider
map.

## Principles

- **Evidence before language.** The statistics engine computes. AI and copy
  explain what it computed and never add a number of their own.
- **Say what the data can bear.** A pattern is not proof of cause. An
  experiment on one person supports a conclusion about that person on those
  days; it does not "prove causation". Three readings, the same ones Advanced
  Dual N-Back uses: a clear change, within noise, not enough data yet. A result
  the engine could not compare as change-versus-baseline says so instead of
  borrowing one of the three — a multi-condition run is not "not enough data",
  and a run with no variance is not proof there was no difference.
- **The first week must pay.** A person gets something back on day one, day
  three and day seven. Nothing is promised for a date the data may not
  support.
- **Small by default.** The default tracker set is the smallest one that can
  answer a question. More is the user's choice, later.
- **Proposal before mutation.** AI and connected apps propose; the person
  confirms, or has granted a narrow, visible permission in advance.
- **Your data is yours.** Export is free, complete and always available. The
  self-hosted build sends nothing to us. We never gate history.
- **Health-adjacent data is sensitive.** Consent is explicit, logs never
  carry values, and no medical claim is made.
- **One codebase.** Cloud and self-hosted are the same code. Cloud-only
  behaviour is switched by configuration, never forked.

## Surfaces, and what each one is for

| Surface | Layer | State | Stance |
| --- | --- | --- | --- |
| Web app, iOS and Android shells | all | live | Core. The daily check-in is the product. |
| Home screen widgets, one-tap logging | capture | merged, never run on a device | Core. Device pass before the next store build. |
| Apple Health and Health Connect import | capture | built | Core. It is also what connected apps borrow. |
| AI quick log, AI explanations | capture, answers | shipped behind flags | Core, kept narrow. |
| MCP server and API keys for assistants | capture, service | live | Core. Extended for connected apps. |
| **Connected apps** (Advanced Dual N-Back first) | service | not built | The next big piece. `docs/CONNECTED-APPS.md`. |
| Lab experiments | answers | live | Core, and under-exposed. Becomes a main tab. |
| Browser extensions (Chrome, Firefox, Safari) | capture | live or built | Maintained. No new features. |
| Levels (dose decay) | answers | live | Maintained. Fix what is wrong, add nothing. |
| Self-hosted build (public AGPL snapshot) | service | live | Maintained. It is the trust story and a front door. |
| Researcher studies, attestations | answers | live as a pilot | Maintained. New work needs a real study. |
| Apple Watch app | capture | written, never compiled | Parked. |
| Desktop app with a local database | service | planned | Parked. |

## The family

Datalyst is the hub for the maker's other apps. Each one measures or does one
thing well and has no business rebuilding a tracker, a health import or a
widget; Datalyst has no business rebuilding their instruments.

- **Advanced Dual N-Back** measures working memory objectively. Connected, it
  reads the day's context from Datalyst (sleep, caffeine, mood) and writes one
  measured outcome back. A Lab experiment can then use a measured outcome
  instead of a self-rating, which is something no symptom tracker offers.
- Each app points to the other at the moment it is useful, and nowhere else.
- First-party connections are free on both sides. The loop between products
  is worth more than a gate on it.

The rules for any connected app are in `docs/CONNECTED-APPS.md`.

## Money

Datalyst Cloud needs a paid plan and does not have one. The live site says it
does; that sentence comes out first (`ROADMAP.md`, T1).

The shape, with the price still to be set by Gus (`docs/OPEN-DECISIONS.md`):

- **Free, for good:** unlimited trackers and check-ins, widgets, patterns,
  one experiment at a time, full export, connected first-party apps, and the
  self-hosted build with everything in it.
- **Plus, a subscription:** what costs us money to run or is power use.
  AI quick log and explanations, Apple Health and Health Connect import,
  several experiments at once, and assistant access beyond a small allowance.

A subscription here, where Advanced Dual N-Back is one payment, because
Datalyst has servers and that app does not. We never charge for a person's
own history, and we never take away something that was free.

## What we are not building now

A general chat assistant. A protocol builder that stands between a new person
and their first check-in. A social feed, community or leaderboard. Team
workspaces. Server-to-server study enrolment. A watch app or a desktop app
before the phone is right. Third-party app registration before a first-party
app has proven the contract. Diagnosis, treatment advice or any clinical
claim. `ROADMAP.md` says what would reopen each.

## Working here

Private repository first, public snapshot follows (`AGENTS.md`). Branch, PR,
review, merge; merging to `main` deploys. Never touch production data,
Supabase production or store releases from an ordinary session. For any UI
change, check 360, 390 and 412 px wide and the Daily Check-in and Data flows.
