# AI platform state

Living record of what is shipped, what is behind a flag, what the model still gets wrong and
what is deliberately deferred. Numbers, not adjectives. Newest section first.

The contract is [`ROADMAP.md`](../ROADMAP.md); the native (non-AI) surfaces are in
[`native-surfaces.md`](native-surfaces.md).

---

## 2026-11-13 — Phase 0 closed

### What this cycle added

| Thing | Where | Flag | Tests |
|---|---|---|---|
| Per-capability switches | `src/ai/flags.ts` | `AI_ENABLED`, `AI_FEATURE_<CAPABILITY>` | `__tests__/flags.test.ts` (5) |
| Redaction rule + log-safety guard | `src/ai/redaction.ts` | — | `__tests__/redaction.test.ts` (13) |
| The one AI log path | `src/ai/run-log.ts` | — | `__tests__/run-log.test.ts` (2) |
| Artifact + evidence contracts | `src/ai/schemas/artifacts.ts` | — | `__tests__/artifacts.test.ts` (11) |
| Per-user AI rate limit | `src/ai/rate-limit.ts` | `AI_RUNS_PER_MINUTE` | `__tests__/rate-limit.test.ts` (3) |
| Synthetic evaluation fixtures | `src/ai/__tests__/fixtures.ts` | — | consumed by the artifact and redaction tests |

Two things this cycle got wrong first and then fixed, recorded because they are the kind of
mistake that looks like a feature:

- The redaction guard was a length heuristic, so `{ note: 'chest pain again' }` passed. It now
  requires every metadata string to be a single token: identifiers, model ids, error codes and
  correlation ids never contain whitespace, and prose always does.
- The guard also guarded nothing, because no AI code logged at all. `src/ai/run-log.ts` is now
  the only log path and it runs the guard first, dropping and counting metadata that fails.

### Capability status

| Capability | Roadmap § | Flag | State |
|---|---|---|---|
| C — evidence-backed explanations | Phase 3 | `AI_FEATURE_INSIGHTS` | **shipped.** The model selects evidence ids and an interpretation category; every number is rendered from the packet. `src/ai/insights.ts`, `services/ai-insights.service.ts`. |
| B — natural-language entry drafts | Phase 2 | `AI_FEATURE_QUICK_LOG` | **shipped as a proposal path.** `services/quick-log.service.ts` returns proposals only and has no write path; the user confirms through quick entry. |
| A — protocol builder | Phase 1 | `AI_FEATURE_PROTOCOL_BUILDER` | **not built.** Schema exists (`protocolProposalContentSchema`), no service, no route, no UI. |
| D — experiment planner | Phase 4 | `AI_FEATURE_EXPERIMENT_PLANNER` | **partial.** `explainEvidence` proposes one experiment direction inside an insight; there is no standalone planner or review artifact. |
| E — next-best observation | Phase 4 | `AI_FEATURE_NEXT_OBSERVATION` | **not built.** Schema exists, nothing produces one. |

With every flag off, no request reaches a provider. Check-in, statistics, correlations, Lab and
export are untouched, and both UIs fall back to deterministic copy (`AiInsightsPanel`,
`QuickLogBar`).

### What the model still gets wrong

Measured on the synthetic fixtures only — no real user data has been sent for evaluation.

- **Quick log, unit variation.** `1h30`, `90 min` and `1.5 hours` all have to become `1.5`; the
  prompt asks for the conversion and `toProposals` clamps the range, but nothing verifies the
  arithmetic. This is the largest known extraction error class.
- **Quick log, ambiguous dates.** "yesterday I slept badly" is supposed to become a question.
  Nothing enforces that yet: `entryDraftContentSchema.questions` exists, `quick-log.service.ts`
  does not fill it. Today the value either lands on today or is dropped.
- **Quick log, unknown ids.** Handled deterministically: `toProposals` drops any id outside the
  catalog (fixture `prompt injection`), so an injected `v999` cannot write anything.
- **Insights, causal language.** On the shipped path the model cannot emit prose at all — it
  returns an `interpretation` enum and the copy is fixed in `EXPLANATIONS`, so causal wording is
  impossible by construction rather than by prompting. The §7.2 `insight_explanation` contract is
  *not* that path and does allow prose: it is unimplemented, and it says so below.
- **Insights, invented statistics.** Impossible on the shipped path: the selection schema is
  strict, so a `pValue` key in the reply fails parsing. The §7.2 explanation contract no longer
  carries a sample size or a method at all — both are read from the cited packet — so the future
  path cannot invent them either (`artifacts.test.ts`).

### Deferred, with the reason

- **Persisting `AiArtifact` rows.** The envelope exists and validates `content` against the
  schema for its `kind`, so an artifact cannot be stored with unvalidated content. Nothing writes
  rows yet: there is no accept/reject surface until Capability A exists, and a table before its
  first reader is a migration we would have to change.
- **Persisting `AiRunMetadata`.** One shape now, and it accepts what the runner actually emits
  (`artifacts.test.ts` asserts that against a real run's fields). Nothing stores it: the log line
  is the only consumer. A table is worth adding when a cost or quality dashboard reads it.
- **The §7.2 `insight_explanation` contract.** Defined and tested, but not what ships. The
  shipped explanation is `selectionSchema` in `src/ai/insights.ts`, which is narrower on purpose.
  Do not read the contract as a description of the live behaviour.
- **A quality/cost dashboard.** `aiDailyUsage` records spend per user per day and
  `AiRunMetadata` records per-run latency and status, but neither is aggregated or shown. Wait
  for real usage before choosing the axes.
- **Free-tier AI limits.** `AI_DAILY_LIMIT_USD` (default 0.10, hard-capped at 1) and
  `AI_RUNS_PER_MINUTE` (default 6) are guardrails, not a pricing model. Pricing needs the cost
  per accepted artifact, which needs Capability A. The minute limit is an in-process counter, so
  it is per server instance and resets on a cold start: it bounds one instance, not the fleet.
  The daily budget is the durable ceiling because it is a database row.
- **Prompt versioning.** `aiRunMetadataSchema` has an optional `promptVersion`; the prompts in
  `ai/insights.ts` and `quick-log.service.ts` are inline strings with no version constant yet.
  Add it when a prompt is first changed against a measured baseline.
- **Flag state in the UI.** `AiInsightsPanel` learns that a capability is off only when the
  request fails, and `QuickLogBar` hides only when no provider is configured. The consent
  endpoint does not return the flag yet, so both controls render and then explain themselves.

### Verification for this cycle

- `npx vitest run`: 412 passed, 2 skipped.
- `npx tsc --noEmit`: clean.
- `eslint src/ai src/services src/components`: 1 error, 4 warnings, all pre-existing on `main`
  (`CloudflareAnalytics.tsx` sync script) — none in `src/ai`.
- No Swift or Gradle change in this cycle.

Both reviews behind these numbers were independent: `deepseek-v4.1-flash` on deeprelay, read
only, given the diff and no history. The second one found that the redaction guard was a
heuristic that let short prose through and that nothing in the codebase logged at all, which is
why the guard is now an identifier rule with a real caller.
