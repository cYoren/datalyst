# Open decisions

Status: current

Things waiting on a human, not on code. Each entry names the owner, what it blocks, the options,
and what would make it decidable. Delete the entry when it is decided — the decision belongs in
the doc it affects, not here.

This file exists because a decision that lives only in a conversation is a decision that gets
lost. If it is not here, it is not open.

## 1. The price of Datalyst Plus, and how it is billed

**Owner:** Gus. **Blocks:** `ROADMAP.md` milestone 5 (M3 billing, M4 copy). Nothing else.

`PRODUCT.md` fixes the shape: free keeps unlimited trackers and check-ins, widgets, patterns, one
experiment at a time, full export and first-party connected apps; Plus is a subscription for AI
quick log and explanations, Apple Health and Health Connect import, several experiments at once
and assistant access beyond a small allowance. Self-hosted has everything.

To decide:

- **Price.** Recommendation: US$4.99 a month or US$34.99 a year, the yearly plan preselected,
  no trial (the free tier is the trial). This is a starting point, not a researched number:
  check what the symptom and habit trackers people compare us with charge today before fixing it.
- **Billing route.** In-app purchase is required on iOS and Android; the web needs a card
  processor. Either a purchases service that unifies the three (free up to a revenue threshold;
  verify the current terms) or the two store APIs plus a processor wired by hand. Recommendation:
  the unifying service, because the entitlement logic is the part that goes wrong.
- **Existing accounts.** Recommendation: everyone who signed up before the plan launches keeps
  Health import and AI as they have them today, permanently.

What makes it decidable: nothing more is needed; this is a call.

## 2. Widget one-tap logging has never run on a device

**Owner:** Gus (needs hardware). **Blocks:** the next store build.

Merged in #63 and compiled by Xcode Cloud, but no device pass exists. What to check: the Log
pill appears only when the next check-in is yes/no, a tap writes the entry (verify on
`/dashboard`), the pill disappears once nothing loggable is left, revoking "Home screen widget"
in Settings makes the next tap fall back to "Couldn't log" and a later sync reissues a key, and
midnight resets the fraction without opening the app. The full checklist is in
[`native-surfaces.md`](native-surfaces.md) → "Next build checklist".

## 3. Where AI requests are processed

**Owner:** Gus. **Blocks:** selling Plus in the EU with AI as a paid feature.

The AI consent text names the provider. The provider in use is hosted in China, and the question
of whether that is acceptable for health-adjacent data from EU users was raised on 2026-11-01 and
never answered. Options: keep it and say so plainly in the consent text and the privacy page;
route EU accounts to a provider with EU processing; or make the provider a per-region setting.
The code already supports any provider through configuration, so this is a policy call and a
cost, not an engineering problem.

## Decided, kept here until the next cleanup

- **The 14-day promise** (was §1). Decided 2026-11-14 in `ROADMAP.md` W3: onboarding stops
  promising an answer after 14 days, and the dashboard counts readiness per pair of variables
  instead of one global day count.
