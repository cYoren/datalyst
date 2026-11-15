# Datalyst docs

Status: current

Read this before any file in `docs/`. It says what is current and what is historical.

## Current

Start with `../PRODUCT.md` (the direction) and `../ROADMAP.md` (the work order, with IDs and
acceptance tests). Also at the root: `../AGENTS.md`, `../tasks/open-source-plan.md` (private tree only — `tasks/` is
export-ignored, so that link is dead in the public snapshot).

| Doc | What it is |
| --- | --- |
| `CONNECTED-APPS.md` | Specification, not built: how another app (Advanced Dual N-Back first) connects, what it may read and write, the API and the consent screen. |
| `AI-PLATFORM.md` | The contract for how AI work is done: principles, architecture, data contracts, privacy, evaluation. Formerly the root `ROADMAP.md`. |
| `ATTESTATION_RUNBOOK.md` | Operator order of operations for EAS attestations: schema registration, migration, environment, offchain vs onchain, signer lifetime, recovery. |
| `CHARTS.md` | Current doc. The house chart: the dot matrix, why it is canvas, and how to use it. |
| `CLOUDFLARE_WORKERS.md` | Current doc. |
| `activation-2026-11-14.md` | Current doc. The first activation numbers, recorded as a baseline with the command that produced them, and what they do not say. |
| `HANDOFF-2026-11-14.md` | Current doc. Everything still open after the 2026-11-14 release, and who can close it: the production migration (which database it is, and which two it is not), the activation report, the restore drill, the DNB PR queue, the widget device pass, the public snapshot. |
| `HEALTH_IMPORT_SECURITY.md` | Current doc. |
| `LEVELS.md` | Current doc. How `/levels` models decay. |
| `MIGRATION_BASELINE.md` | Current doc. The PostgreSQL baseline, how to mark it applied, rollback. |
| `INTEGRATIONS.md` | API keys, scopes, MCP tools (table generated from the code), rate limits, the two enrolment paths, and what the surface cannot do yet. |
| `LOCAL_POSTGRES_SMOKE.md` | Current doc. |
| `PRIVACY_OPERATIONS.md` | Current doc. LGPD/GDPR requests, consent, retention. |
| `SERVICE_OPERATIONS.md` | Current doc. Uptime check, restore drill, paging, error-report contents (`ROADMAP.md` S4). |
| `SEO_SEARCH_CONSOLE_2026-11-04.md` | Current doc. |
| `VERIFIABLE_RESEARCH.md` | Current doc. |
| `ai-insights.md` | Current doc. |
| `research-agent-workflow.md` | Current doc. |
| `researcher-studies.md` | Current doc. |
| `studies-roadmap.md` | Parked. The three gaps between shipped studies and easy hosting, with acceptance criteria. |
| `AI-PLATFORM-STATE.md` | Current doc. What the AI platform ships, behind which flag, what the model still gets wrong, and what is deferred with the reason. |
| `native-surfaces.md` | Current doc. The Capacitor shells and home screen widgets: the decision log, the widget inventory, and the next-build checklist. |
| `xcode-cloud.md` | Current doc. The Xcode Cloud setup and what it has been verified against. |
| `STORE-LINKS.md` | Current doc. Where each store listing lives. |
| `OPEN-DECISIONS.md` | Current doc. What is waiting on a human rather than on code, and who decides. |

## Historical

| Path | Why |
| --- | --- |
| `archive/` | Superseded docs, kept for provenance. Not current guidance. |

## Rules

- Every doc carries a `Status:` line: `current` or `historical <date>`.
- Superseded docs move to `docs/archive/`; never delete them.
- Live state comes from the tools, never from a doc.
