# Datalyst docs

Status: current

Read this before any file in `docs/`. It says what is current and what is historical.

## Current

Root docs: `../ROADMAP.md`, `../tasks/open-source-plan.md`.

| Doc | What it is |
| --- | --- |
| `ATTESTATION_RUNBOOK.md` | Operator order of operations for EAS attestations: schema registration, migration, environment, offchain vs onchain, signer lifetime, recovery. |
| `CLOUDFLARE_WORKERS.md` | Current doc. |
| `HEALTH_IMPORT_SECURITY.md` | Current doc. |
| `LEVELS.md` | Current doc. How `/levels` models decay. |
| `MIGRATION_BASELINE.md` | Current doc. The PostgreSQL baseline, how to mark it applied, rollback. |
| `INTEGRATIONS.md` | API keys, scopes, MCP tools (table generated from the code), rate limits, the two enrolment paths, and what the surface cannot do yet. |
| `LOCAL_POSTGRES_SMOKE.md` | Current doc. |
| `PRIVACY_OPERATIONS.md` | Current doc. |
| `SEO_SEARCH_CONSOLE_2026-11-04.md` | Current doc. |
| `VERIFIABLE_RESEARCH.md` | Current doc. |
| `ai-insights.md` | Current doc. |
| `research-agent-workflow.md` | Current doc. |
| `researcher-studies.md` | Current doc. |
| `studies-roadmap.md` | The three gaps between shipped studies and easy hosting, with acceptance criteria. |

## Historical

| Path | Why |
| --- | --- |
| `archive/` | Superseded docs, kept for provenance. Not current guidance. |

## Rules

- Every doc carries a `Status:` line: `current` or `historical <date>`.
- Superseded docs move to `docs/archive/`; never delete them.
- Live state comes from the tools, never from a doc.
