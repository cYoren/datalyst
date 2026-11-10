# Evidence insights

Status: current

AI insights are explicitly opt-in in Settings. The provider receives only numbered
correlation facts (coefficient, p-value, sample size, method) and whether each fact
can support a plan with two distinct trackers. It receives no names,
raw measurements, journal text, email, local user ID, or measurement history.
The model selects evidence IDs and a constrained interpretation category. Zod
rejects invented evidence IDs, additional fields, duplicate findings, free text,
and truncated responses. Datalyst supplies every sentence and numerical value.
The duration planner calls `src/stats/analysis.calculatePower` locally with a
10% relative target; AI does not calculate statistics or prescribe interventions.
Findings within one tracker remain reviewable, but cannot create a Lab experiment
against that same tracker. A response may contain findings with no selected plan.

## Configuration

Apply the reviewed additive SQL migration before deploying, by hand or through
`prisma migrate deploy` once the database is baselined (`docs/MIGRATION_BASELINE.md`).

- Any LLM: `AI_MODEL` + `AI_API_KEY` (+ `AI_BASE_URL` for any OpenAI-compatible API, `AI_PROVIDER=anthropic` for Claude). See `src/ai/config.ts`. Absent means unavailable, never fake output.
- Legacy: `DEEPSEEK_API_KEY`: server-side credential.
- `DEEPSEEK_MODEL_ID` (optional, default `deepseek-flash`): allowlisted model, called through the Anthropic-format endpoint at api.deepseek.com/anthropic.
- `AI_DAILY_LIMIT_USD=0.10`: per-user UTC daily limit, clamped to at most one dollar.

Model ID and prices were checked against Anthropic's
[models overview](https://platform.claude.com/docs/en/models/overview) on 2026-10-07.
Production models do not change the synthetic default module allowlist.
Transport uses the documented [Messages API](https://platform.claude.com/docs/en/api/messages).

Database reservations are atomic across server instances and reserve conservative
input/output maximums before sending. Retries are disabled. Failed calls retain
reservations since the vendor may have billed them. Cache hits do not reserve
budget. Configure an account-level vendor spend cap in addition to per-user limits.

AI cache fields live alongside, separately from, the deterministic InsightsCache
payload. Evidence, outcome history, model, or schema changes invalidate the cache;
expiry is one hour. Revocation removes cached AI results and is checked again
before invocation and publication. It cannot recall an already sent request.
Provider-side data retention is subject to Anthropic's API policy.

`AiDailyUsage` and `InsightsCache` are server-owned: RLS is enabled, the legacy
client-write cache policy is removed, and browser/public grants are revoked.
Prisma must connect as the table owner or an appropriately privileged server role.
The account export includes consent timestamps, generated cache results and daily
reservations (conservative ceilings, not actual billed costs). Both AI rows and
cache rows cascade on account deletion. Revoking AI consent clears the AI cache
but retains reservations so toggling consent cannot reset the daily limit.

Run `node scripts/test-ai-usage-rls.mjs` with local PostgreSQL tools on PATH to
verify permissions and deletion against a disposable Unix-socket-only database.
It ignores `DATABASE_URL`, never connects to a project database, and removes its
temporary cluster afterward. It checks browser CRUD denial, default-deny RLS
after accidental grants, server access, migration replay, and deletion isolation.

All tests use FakeAiProvider or mocked HTTP, synthetic measurements and no keys.
