# Activation, 2026-11-14

The first numbers taken after the first-week work (`ROADMAP.md` W1–W5) shipped. There is no "before"
row, because nobody ran the report before the change and the numbers cannot be reconstructed: the
report counts accounts as they are now, not as they were.

So this is the baseline the next change is measured against. It is deliberately recorded with the
command and the raw output, so the next person can repeat it instead of trusting a summary.

```sh
DATABASE_URL='postgresql://…' npm run activation:report
```

```text
accounts              19
created a tracker     12 (63%)
saved a check-in      11 (58%)
logged on 2+ days     6 (32%)
logged on 7+ days     4 (21%)
created an experiment 4 (21%)
median hours to first 0.9
```

Taken 2026-11-14 against the production database (Supabase project `ccgprpgwntuaealojtch`, 19
accounts at the time). On a connection string that terminates TLS with Supabase's own chain, the
report needs `sslmode=no-verify`; the default `require` fails with "self-signed certificate in
certificate chain".

## What these numbers do and do not say

- **19 accounts is too few to call anything a conversion rate.** Read them as counts, not
  percentages: 12 people created a tracker, 11 saved a check-in, 6 have two days, 4 have seven.
- **The two biggest gaps are between "created a tracker" and "saved a check-in"** (one person) and
  between one day and two (five people). The second gap is what W4's day-one/three/seven cards
  exist for, and it is the one to watch.
- **Median 0.9 hours to the first check-in** is the healthy number here: people who get to a
  check-in do it the same session.
- An experiment created by 4 of 19 is the Lab being reachable, not the Lab being useful.

## How to use this

Re-run the same command after the next change that touches the first week, and put the new block
under a `## 2026-MM-DD` heading with one sentence on what changed. Do not rewrite the numbers above:
a baseline that gets edited is not a baseline.
