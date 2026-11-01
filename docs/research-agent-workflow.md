# Datalyst's possible research fit

The working hypothesis is a small-study execution service that Claude and other
agents can operate through explicit researcher permissions. This is a product
hypothesis, not established market demand or a claim that competitors lack AI.

## What already exists

- Claude Research searches web and connected sources and synthesizes cited
  reports. Integrations also execute workflows, so a chatbot, literature summary,
  or generic MCP wrapper is not a sufficient advantage.
  [Anthropic Research and integrations](https://www.anthropic.com/news/integrations)
- Labfront collects wearable and survey data, schedules participant tasks and
  provides researcher dashboards and exports. Collection infrastructure itself
  is already a served category.
  [Labfront workflow](https://www.labfront.com/how-it-works),
  [data management](https://help.labfront.com/data-management-faqs)
- Eureka supports participant research data collection with study-specific
  informed consent. Consent is essential infrastructure, not a unique feature.
  [Eureka privacy and participation](https://info.eurekaplatform.org/privacy-policy-and-data-security-measures/)

Sources checked 2026-10-07. These sources support the capabilities above; they do
not prove that any competitor lacks Datalyst's implementation details.

## Narrow wedge to test

Small behavioral crossover pilots: an AI-assisted draft becomes a frozen,
executable protocol; each person gets randomized assignments in familiar daily
Check-in; researchers receive bounded pseudonymous evidence with explicit
missingness and analysis assumptions. A personal N=1 workflow and a study share
the same recording machinery. Content proofs can make plan/result changes
inspectable, but do not establish scientific truth or participant compliance.

The proposed value is less setup and fewer handoffs between protocol writing,
daily participation, evidence extraction, and reproducible analysis. It is not
replacement of Claude's reasoning, an ethics review, or a clinical trial platform.

## Implemented agent workflow

1. Researcher creates a **study research access** key in Settings and connects the
   MCP endpoint from the existing agent setup guide. These scopes are separate
   from personal tracker keys; existing personal keys gain no study access.
2. Agent calls `get_study_protocol_schema`, drafts a protocol with its user, then
   calls `create_study_draft` with `research:write`. The service validates it and
   saves a frozen draft. There is no agent recruitment/consent tool.
3. Researcher reviews in Lab and explicitly opens recruitment. Participants
   independently review the protocol and data/AI disclosure, consent, receive
   schedules/trackers, and can withdraw in the app.
4. An owner or analyst can explicitly give an agent `research:read` access to
   `get_study_evidence`. Membership is checked on every request. The packet
   includes protocol/hash, pseudonymous numeric rows, missingness, codebook,
   deterministic participant effects and DL aggregation. Recruitment codes,
   identities, unrelated trackers and notes are excluded.
5. Agent quotes packet results and limitations. Withdrawal excludes all of that
   participant's observations from new packets; exported copies cannot be recalled.

Manual protocol JSON import and evidence CSV/JSON download support the same
workflow without an MCP-capable client. The built-in personal AI opt-in is separate
from a researcher's explicit decision to connect an external agent.

## Limits and validation before expanding

The pilot supports one numerical outcome, two visible conditions, up to 200
participants, 8–180 days, and no study washout. DL uses an independence assumption
for daily errors and normal intervals; serial correlation, carryover, adherence,
missingness and few participants can undermine inference. These limits appear in
the evidence packet. Health import is a personal feature; this study version does
not silently reuse existing health records or unrelated trackers.

Recruit three researchers with an actual upcoming, suitable pilot. Have them run
the same setup using their current tools and this workflow, then measure protocol
setup time, avoidable manual steps, participant completion, withdrawal correctness,
and whether an analyst can reproduce every reported number from the export.
Proceed only if at least two can complete a real pilot and choose to use the
workflow again. If they primarily need literature search or one-off analysis of
an existing file, Claude already addresses that job; avoid expanding Datalyst for it.

Before real recruitment: migrated staging DB tests, ethics/institutional review
appropriate to the study, device-level checks, and owner-approved production
rollout. This implementation makes no compliance certification claim.
