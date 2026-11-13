# Open decisions

Status: current

Things waiting on a human, not on code. Each entry names the owner, what it blocks, the options,
and what would make it decidable. Delete the entry when it is decided — the decision belongs in
the doc it affects, not here.

This file exists because a decision that lives only in a conversation is a decision that gets
lost. If it is not here, it is not open.

## 1. The 14-day promise in onboarding

**Owner:** Gus. **Blocks:** nothing shipped; it is a claim the product already makes.

Onboarding promises that after 14 days Datalyst shows what "actually moves the needle". The
dashboard measures that with total logging days — "N more days until pattern detection" — which
does not establish paired, varying data for any particular relationship. A user can reach day 14
with fourteen days of one variable and no comparison at all.

Options:

- Promise the immediate recap only, and describe relationship discovery as conditional on
  adequate paired data.
- Show readiness per pair ("Sleep vs caffeine: 6 more paired days") instead of one global count.

Either way the copy in `src/app/onboarding/page.tsx` and the card in
`src/app/(app)/dashboard/page.tsx` move together. Source: the 2026-11-05 revenue audit,
finding 3.

## 2. Widget one-tap logging has never run on a device

**Owner:** Gus (needs hardware). **Blocks:** the next store build.

Merged in #63 and compiled by Xcode Cloud, but no device pass exists. What to check: the Log
pill appears only when the next check-in is yes/no, a tap writes the entry (verify on
`/dashboard`), the pill disappears once nothing loggable is left, revoking "Home screen widget"
in Settings makes the next tap fall back to "Couldn't log" and a later sync reissues a key, and
midnight resets the fraction without opening the app. The full checklist is in
[`native-surfaces.md`](native-surfaces.md) → "Next build checklist".
