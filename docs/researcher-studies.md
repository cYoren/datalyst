# Studies: execution infrastructure for AI-assisted research

Claude Research already performs iterative searches across the web and connected internal context, synthesizes answers and supplies citations. Its current help page was updated June 2, 2026 ([official documentation](https://support.claude.com/en/articles/11088861-use-research-on-claude), reviewed October 7, 2026). Claude integrations also connect tools and execute workflows, with remote MCP support ([official announcement](https://claude.com/resources/articles/integrations)). A literature-summary feature alone offers little differentiation.

Our product inference: Datalyst should own the durable participant and measurement boundary. Let researchers use Claude for background investigation, protocol drafting and subsequent interpretation. Datalyst turns an explicitly reviewed protocol into consent records, individual randomized assignments, daily trackers, revocable researcher access and reproducible numeric evidence. This is a proposed fit to validate with actual research teams, not a claim that Claude cannot perform these tasks or that Datalyst replaces an institutional research platform.

The first useful workflow is: draft a two-condition pilot with an AI assistant, import its structured protocol, review it, recruit participants, collect consented repeated measurements through Check-in, inspect pseudonymous progress, then deliberately export evidence to the analysis tools or AI assistant of your choice. No AI calls or automatic third-party sharing occur in this feature.

## Shipped pilot boundary

- `/lab/studies`: import `datalyst.study.v1` JSON, review, and explicitly open recruitment. A frozen SHA-256 digest covers the validated protocol and built-in data disclosure. Changing a protocol requires a new study and new consent.
- `/api/studies/schema`: authenticated JSON Schema for AI protocol generation. Unknown properties, invalid dates and unsupported analyses are rejected. This portable contract is suitable for future MCP tool wrappers; it does not itself expose an MCP tool.
- `/join/[code]`: authenticated invitation, full protocol/contact/disclosure, explicit unchecked opt-in. Enrollment creates two study-specific trackers, an experiment and an immutable randomized assignment snapshot. Invitation tokens contain 144 random bits. Enrollment is serialized, idempotent and capped at 200 participants.
- `/lab/studies/[id]/participation`: participant schedule and consent record, plus permanent withdrawal. Existing Check-in records the assigned numeric outcome. Outcome data is analyzed against immutable study assignments even if a participant edits their personal experiment. These are visible conditions, not blinded experiments.
- `/lab/studies/[id]`: owner/analyst dashboard, per-participant completeness, exploratory effects, CSV observations and JSON evidence with a codebook. Only owners approve/close recruitment and grant/revoke analysts by known account ID. Closing recruitment does not stop existing participants' collection.

## Data boundary

The server derives the actor from Supabase authentication; it never accepts an actor ID from request data. Researcher membership and participation are separate authorizations. All researcher evidence paths check study membership before reading any outcomes. Reads use `no-store`.

Study data is read only from the assigned outcome tracker and exact assigned subvariable, bounded to protocol dates, scheduled days and consent date. Daily duplicates, out-of-range/nonfinite values, future days and missing outcomes are excluded without imputation. One observation per person per day is retained. Data from unrelated trackers, notes, raw values, emails, names and account IDs is never selected for researcher evidence. Day numbers replace calendar dates; independently random per-study IDs replace participant identities. Pseudonymous exports remain sensitive and may permit inference in small groups.

Withdrawal and evidence reads serialize on the same study row. Once withdrawal completes, fresh dashboards and exports omit all of that person's observations. Existing downloaded copies cannot be recalled; this limitation is disclosed before consent. Withdrawal archives only that participant's study-created trackers/experiment and preserves their personal entries. They cannot re-enroll in that study. Deleting a user cascades their membership, participation and consent. The study stores tracker links as identifiers so deletion of a personal tracker leaves missing data rather than deleting the withdrawal/consent record.

CSV has fixed columns `participant,day,condition,value`, with generated IDs and numeric values only. JSON contains protocol and hash, generation time, the same rows, participant effects, exclusions, meta-analysis and codebook; it omits invitation codes and researcher roles. Protocol/contact text is researcher-provided: review it before sharing. Download JSON alongside CSV for the codebook and analysis caveats.

## Statistical scope

Each participant contributes the raw mean difference `B − A` in the shared protocol outcome unit. Sampling variance is `sA²/nA + sB²/nB`. At least two observations per condition and finite positive variance are required; zero-variance and insufficient records are reported as exclusions. There is no pooled estimate until at least two participants qualify.

Aggregation uses the DerSimonian–Laird method of moments, inverse `(variance + tau²)` weights, a normal approximate 95% interval, Q and I². This pilot assumes independent daily errors within each person. Serial correlation, carryover, non-adherence and missingness are material limitations; few-participant intervals can be too narrow. These limitations accompany every result/export. It is an exploratory estimator, not a clinical or causal finding. No washout, blinding, inferential stopping rules or cross-study outcome mixing is implemented.

## Validation and rollout

`npx prisma generate`, `npx prisma validate`, targeted study tests, full Vitest, ESLint, TypeScript and a production build should pass before merge. Tests use synthetic values and mocked Prisma/auth; they cover numerical reference calculations, membership/owner enforcement, consent, withdrawal, narrow data queries, exports and request boundaries. `npx playwright test e2e/studies.spec.ts` exercises protocol creation, recruitment, consent, schedule and withdrawal UI at 360px, 390px and 412px with synthetic mocked APIs. An additive PostgreSQL migration is supplied; no database was migrated by this change. The repository still has a legacy SQLite migration lock/history: resolve the existing PostgreSQL baseline/history mismatch before using `prisma migrate deploy`. Do not replay SQLite migrations against PostgreSQL or use `db push` to bypass review.

Before real recruitment, review/apply migrations to a disposable PostgreSQL instance and verify the complete authenticated researcher → participant → Check-in → export → withdrawal workflow using separate synthetic accounts at 360px, 390px and 412px. Institutional review, study-specific consent, operational monitoring and an appropriate participant data handling policy remain researcher responsibilities. Store publishing and production deployment are outside this change.
