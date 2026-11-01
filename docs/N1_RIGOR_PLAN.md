# N=1 Experimentation Platform — Rigor Upgrade Plan

## Current State

The platform has a working A/B blocked-randomization pipeline with Bayesian and frequentist analysis, blinding support, washout periods, and an audit trail. This is ahead of most self-tracking apps but falls short of the rigor standard set by Gwern's self-experiments or Aella's polling methodology.

## What's Wrong (Root Causes)

| # | Problem | Impact |
|---|---------|--------|
| S1 | Statistics assume independent observations | P-values anticonservative, credible intervals too narrow |
| S2 | Autocorrelation detected but not corrected for | Flagged but ignored in actual inference |
| S3 | No carryover/period-effect testing | Can't tell if condition A bleeds into B measurements |
| S4 | Only binary A/B conditions | Can't do dose-finding (the most valuable use case) |
| S5 | "Live Analysis" link encourages peeking | Optional stopping bias destroys validity |
| S6 | Bang Index is single-guess (meaningless) | No real blinding integrity assessment |
| S7 | Autocorrelation computed on wrong order | Detects artificial level-shift, not true serial dependence |
| S8 | Server UTC vs client local time for "today" | Assignment/progress mismatch across timezones |
| S9 | No crossover-aware analysis | Block structure discarded, period effects invisible |
| S10 | Power calc ignores autocorrelation | Overestimates power, trials end too early |
| S11 | Washout days labeled with incoming condition | Semantic confusion, risk of data contamination |
| S12 | Population variance in Bayesian, sample SD elsewhere | Inconsistent, slightly underestimates uncertainty |

---

## Phase 1: Fix What's Broken (Statistical Integrity)

These are bugs and correctness issues in the existing code. No new features.

### 1.1 — Fix timezone handling
- **File:** `src/app/api/experiments/active-assignment/route.ts`
- Accept `?date=YYYY-MM-DD` query param from client
- Validate it's within ±1 day of server UTC date
- Use client-provided date for assignment lookup and `hasLoggedToday` check
- **File:** `src/components/lab/ActiveTrialWidget.tsx`
- Send `format(new Date(), 'yyyy-MM-dd')` as query param
- Parse `startDate`/`endDate` with `parseISO` from date-fns (not `new Date(str)`)

### 1.2 — Fix autocorrelation computation order
- **File:** `src/stats/analysis.ts` → `performN1Stats()`
- Add a `temporalValues: number[]` parameter (full time-ordered series)
- Compute autocorrelation on this instead of `[...conditionA, ...conditionB]`
- **File:** `src/app/api/experiments/[id]/results/route.ts`
- Pass chronologically ordered values to `performN1Stats`

### 1.3 — Fix washout condition labeling
- **File:** `src/stats/analysis.ts` → `generateBlockedSchedule()`
- Set `condition: 'WASHOUT'` (or keep current condition but document clearly)
- Ensure all downstream consumers filter on `isWashout` before grouping by condition

### 1.4 — Use sample variance consistently
- **File:** `src/stats/analysis.ts` → `calculateBayesianPosterior()`
- Replace `ss.variance()` with `ss.sampleVariance()` for both groups
- This gives N-1 denominator, correct for small samples

### 1.5 — Fix `logicalDate` query
- **File:** `src/app/api/experiments/active-assignment/route.ts`
- Replace `startsWith: today` with `equals: today` (logicalDate is YYYY-MM-DD)

### 1.6 — Fix frontend date parsing
- **File:** `src/components/lab/ActiveTrialWidget.tsx`
- Use `parseISO(experiment.startDate)` instead of `new Date(experiment.startDate)`
- Same for `endDate`

---

## Phase 2: Statistical Rigor (Gwern Standard)

New statistical methods to make the analysis scientifically defensible.

### 2.1 — Autocorrelation-corrected inference
- **File:** `src/stats/analysis.ts` (new function)
- Implement Newey-West standard error correction for the mean-difference test
- When lag-1 autocorrelation > threshold, use corrected SEs in both t-test and Bayesian
- Alternatively: analyze block-level means (each block → one observation per condition) as a simpler robust approach

### 2.2 — Carryover effect test
- **File:** `src/stats/analysis.ts` (new function `testCarryoverEffect`)
- Compare first-half vs second-half of each condition block
- If measurements systematically differ by position within block, flag carryover
- Add result to `N1TrialResult` and `AuditReport`

### 2.3 — Period/sequence effect test
- **File:** `src/stats/analysis.ts` (new function `testPeriodEffect`)
- Test whether condition A's effect differs between early blocks and late blocks
- Detects habituation, seasonal drift, learning effects
- Report in audit

### 2.4 — Sequential testing framework (alpha spending)
- **File:** `src/stats/analysis.ts` (new function `sequentialBoundary`)
- Implement O'Brien-Fleming spending function
- At each interim look, compute the adjusted significance threshold
- **File:** `src/components/lab/ExperimentChart.tsx` or results page
- If experiment is still ACTIVE, show results with a clear warning: "Interim analysis — boundaries not yet crossed"
- Show the spending function visually (current test stat vs boundary)

### 2.5 — Effective sample size adjustment for power
- **File:** `src/stats/analysis.ts` → `calculatePower()`
- After computing raw `requiredDays`, adjust by variance inflation factor: `n_eff = n * (1 - r) / (1 + r)` where r = lag-1 autocorrelation
- Show both nominal and effective sample sizes

### 2.6 — Block-aware analysis
- **File:** `src/stats/analysis.ts` (new function or modify `performN1Stats`)
- Group data by block, compute within-block A-B differences
- Run one-sample t-test on these differences (paired by block)
- This naturally handles autocorrelation within blocks and is the standard crossover analysis

---

## Phase 3: Multi-Condition & Dose-Finding

The most impactful feature expansion. Enables the "find my optimal dose" use case.

### 3.1 — Schema: multi-arm support
- **File:** `prisma/schema.prisma`
- Change Assignment.condition from implicit A/B to support arbitrary labels
- Add `Experiment.conditions` field (JSON array of condition definitions)
- Each condition: `{ label: string, dose?: number, description?: string }`
- Migration: existing A/B experiments map to `[{label:"A"},{label:"B"}]`

### 3.2 — Multi-arm randomization
- **File:** `src/stats/analysis.ts` → `generateBlockedSchedule()`
- Generalize from 2 conditions to N conditions
- Block size must be multiple of N (or nearest)
- Washout between any condition change

### 3.3 — Multi-arm analysis
- **File:** `src/stats/analysis.ts` (new functions)
- Kruskal-Wallis test for >2 groups (non-parametric, robust for small N)
- Pairwise comparisons with Bonferroni correction
- Dose-response regression: if conditions have numeric doses, fit linear/quadratic model
- Report optimal dose estimate with confidence interval

### 3.4 — API & UI updates
- **File:** `src/app/api/experiments/route.ts` — accept conditions array on creation
- **File:** `src/app/api/experiments/[id]/results/route.ts` — return multi-arm results
- **File:** `src/components/lab/ActiveTrialWidget.tsx` — show condition from N options
- **File:** New component: `DoseResponseChart.tsx` — visualize dose-response curve
- **File:** Experiment creation form — UI for defining multiple conditions with optional dose values

---

## Phase 4: Blinding & Integrity

### 4.1 — Per-block blind guess collection
- **File:** `prisma/schema.prisma`
- Add `BlindGuess` model: `{ experimentId, blockIndex, guess, createdAt }`
- Prompt user at end of each block: "Which condition do you think you were on?"

### 4.2 — Aggregate Bang Index
- **File:** `src/stats/analysis.ts` → `calculateBangIndex()`
- Accept array of `{ guess, actual }` pairs
- Compute proportion correct, test against chance (binomial test)
- Return meaningful 0-1 index with confidence interval

### 4.3 — Blinding setup guide
- New component or onboarding step for blinded experiments
- Instructions for physical blinding (capsule preparation, helper protocol)
- Flag experiments where blinding is implausible given the intervention type

---

## Phase 5: Results Gating & Transparency

### 5.1 — Gate full results behind end date
- **File:** `src/app/api/experiments/[id]/results/route.ts`
- If experiment status is ACTIVE and no sequential testing is configured:
  - Return only: progress, compliance rate, data quality checks
  - Do NOT return effect sizes, p-values, or Bayesian posteriors
- If sequential testing IS configured: return interim results with adjusted boundaries

### 5.2 — Pre-registration immutability
- Once `hypothesisLockedAt` is set, prevent changes to: hypothesis, conditions, primary outcome, analysis params
- Log any attempted modifications
- Show clearly in audit report whether anything was modified post-lock

### 5.3 — Enhanced audit report
- **File:** `src/stats/analysis.ts` → `generateAuditReport()`
- Add: carryover test results, period effect results, sequential analysis boundaries
- Add: compliance rate (days logged / days assigned)
- Add: data quality metrics (missingness, outliers)
- Export as structured JSON and human-readable markdown

---

## Implementation Checklist

### Phase 1 — Fix What's Broken ✅
- [x] 1.1 Accept `?date=` param in active-assignment API, send from frontend
- [x] 1.2 Fix autocorrelation to use temporal order
- [x] 1.3 Label washout days properly in schedule generator
- [x] 1.4 Use `sampleVariance` in Bayesian posterior
- [x] 1.5 Use `equals` instead of `startsWith` for logicalDate
- [x] 1.6 Use `parseISO` for date parsing in ActiveTrialWidget

### Phase 2 — Statistical Rigor ✅
- [x] 2.0 Fix frontend/backend property mismatch (interface + renders)
- [x] 2.1 Block-mean analysis (one-sample t-test on within-block A-B diffs)
- [x] 2.2 Carryover effect test (first-half vs second-half Welch's t)
- [x] 2.3 Period/sequence effect test (early vs late block diffs)
- [x] 2.4 Sequential testing with O'Brien-Fleming alpha spending
- [x] 2.5 Autocorrelation-adjusted power calculation (variance inflation)
- [x] 2.6 Frontend: collapsible Data Quality section with grouped warnings

### Phase 3 — Multi-Condition
- [ ] 3.1 Schema migration for multi-arm conditions (schema already supports labels, no migration needed)
- [x] 3.2 Generalize blocked randomization to N conditions
- [x] 3.3 Multi-arm statistics (Kruskal-Wallis, dose-response)
- [x] 3.4 Update API, creation form, and results UI

### Phase 4 — Blinding
- [ ] 4.1 Per-block blind guess collection (schema + UI)
- [ ] 4.2 Aggregate Bang Index with binomial test
- [ ] 4.3 Physical blinding guide component

### Phase 5 — Results Gating
- [x] 5.1 Hide inferential stats during active experiments
- [x] 5.2 Enforce pre-registration immutability
- [x] 5.3 Enhanced audit report with all new metrics
