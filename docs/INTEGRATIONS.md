# Integrations: API keys, MCP and the agent surface

Status: current. Describes what ships on `main` today. Nothing here is a plan.

A person creates an API key in Settings. An app or an agent uses that key to act **as that person** over
one of two transports: a remote MCP server (JSON-RPC, tool calls) or a small REST surface. Study hosting
is reachable from MCP for drafting a protocol, listing studies and reading pseudonymous evidence;
everything else about a study stays in the web app, on purpose, because those actions carry consent and
recruitment consequences.

## Endpoints

| Endpoint | Auth | What it is |
| --- | --- | --- |
| `POST /api/mcp` | `Authorization: Bearer dl_…` or `X-API-Key` | Remote MCP server, Streamable HTTP, stateless JSON responses. `initialize`, `ping`, `tools/list`, `tools/call` |
| `POST /api/mcp/<key>` | key in the path | Same server for connectors that only accept a URL. Read-only scopes only |
| `GET`, `POST` on `/api/user/api-keys`; `DELETE /api/user/api-keys/<id>` | session cookie only | Create, list and revoke keys. An API key can never mint another key |
| `POST /api/v1/agent/trial`, `/log`, `GET /api/v1/agent/results/<trialId>`, `GET /api/v1/protocols` | API key | The older N=1 trial API: start a protocol trial, log values, read results |
| `/api/studies/...` | session cookie only | The study routes the web app uses. **Not** reachable with an API key |
| `/.well-known/openapi.json`, `/.well-known/api-catalog`, `/.well-known/agent-skills/index.json`, `/agent.md`, `/auth.md`, `/api/openapi.json`, `/docs/agent-api` | none | Discovery |

`GET` and `DELETE` on `/api/mcp` answer `405`: there is no server-initiated SSE stream and no session.

## Key model

| Property | Behaviour |
| --- | --- |
| Format | `dl_` followed by 32 random bytes, base64url (46 characters) |
| Stored | SHA-256 hex in `ApiKey.keyHash` (unique), plus `prefix` (first 10 characters) for display. The plaintext is returned once, in the `201` response, and never stored |
| Hashing choice | keys are high-entropy random strings, so a fast hash is the right primitive; no salt or KDF adds anything |
| Transport | `Authorization: Bearer <key>` or `X-API-Key: <key>`, max 200 characters |
| Limits | at most 10 active keys per account |
| Revocation | immediate: every request looks the key up, and `isActive` / `revokedAt` are checked per request |
| Labels | `name` (required, shown in Settings) and optional `agentId` for a client identifier |
| Audit | `lastUsedAt` is written on each authenticated request (fire and forget) |

The key is a bearer credential for one account. There is no OAuth, no per-user delegation, and no
server-to-server registration.

## Scope model

Four scopes, stored ordered and deduplicated: `read`, `write`, `research:read`, `research:write`.

| Scope | Grants | Notes |
| --- | --- | --- |
| `read` | personal data: trackers, check-ins, correlations, experiments, results, export | |
| `write` | create trackers, log check-ins, create experiments | does **not** imply `read` |
| `research:read` | `list_studies`, `get_study_protocol_schema`, `get_study_evidence` | personal keys cannot read study evidence |
| `research:write` | `create_study_draft` | |

Rules that follow from the code:

- A tool call with a missing scope returns a tool result with `isError: true` naming the scope
  (`This API key lacks the "research:read" scope…`), not a JSON-RPC protocol error, so an agent can
  read it and tell the user what to change.
- Research access is deliberately separate from personal access: a key issued for a habit app cannot
  read a pseudonymous study export.
- A key carried in the URL (`/api/mcp/<key>`) is treated as leaked — URLs land in request logs and
  browser history. Such a key may only hold `read`; anything else is refused with JSON-RPC `-32003`
  before the call runs.
- `export_data` with `read` returns the whole account export (profile, trackers, entries, templates,
  experiments, logs). It is the broadest scope in the system; do not request it for a single question.

## Tools

Generated from `src/lib/mcp.ts` (`toolList`). `src/lib/integrations-doc.test.ts` fails if this table and
the code disagree, and prints a fresh table when run with `DOCS_TOOLS=print`.

<!-- tools:start -->
| Tool | Scope | What it does |
| --- | --- | --- |
| `get_study_protocol_schema` | `research:read` | Get the versioned JSON schema for drafting a Datalyst study protocol. A draft never starts recruitment or accepts participant consent. Researchers approve recruitment in the app. |
| `list_studies` | `research:read` | List studies where the key owner is a researcher or participant. Requires separate research access; ordinary personal read keys cannot access study evidence. |
| `create_study_draft` | `research:write` | Save a validated, immutable multi-participant study protocol as a draft owned by the key owner. Never recruits participants or consents on their behalf. Human researcher approval in Lab is required before recruitment. |
| `get_study_evidence` | `research:read` | Read a pseudonymous evidence packet with protocol hash, assigned numeric outcomes, missingness, codebook and deterministic DL meta-analysis. Requires current study owner/analyst membership and research:read scope. Withdrawn participants are excluded. Quote supplied results and limitations; do not infer clinical efficacy. Data is pseudonymous, not anonymous. |
| `list_trackers` | `read` | List the user's active trackers and the variables each one records (id, name, type, unit, goal direction). Use these ids with log_checkin, get_entries and create_experiment. Variable types: NUMERIC (any number), SCALE_0_10 (0 to 10), BOOLEAN (1 = yes, 0 = no), CATEGORY. |
| `create_tracker` | `write` | Create a new tracker when the user wants to start tracking something that list_trackers does not have yet (for example "track my headaches"). Prefer 1 to 3 variables. Then use log_checkin with the returned ids. Icon keys: target, dumbbell, meditation, moon, book, coffee, phone, sun, smile, activity, users, salad, zap, bandage, study, wallet, water, pill, guitar, laptop, home, brain, heart-pulse, heart, flame, steps, scale, flask, chart, wine, journal, briefcase, palette, gut, stress, cycle, family, music, bike, apple, smoking, baby, pet, leaf, bed, game, car, travel, temperature, timer, mountain. Requires a key with the write scope. |
| `get_today` | `read` | Check-in status for one day: every variable scheduled that day, with its logged value if any, plus logged/total counts. Pass the user's local calendar date (the server clock is UTC and must not pick the day). |
| `parse_log` | `read` | Turn a short sentence like "slept 6h, headache 7, no coffee" into proposed values for the user's own trackers, using the server's configured AI. Nothing is saved: confirm with the user, then call log_checkin for each proposal. Needs AI insights turned on in Settings. |
| `log_checkin` | `write` | Record one variable's value for one day, exactly like the app's Check-in. Creates the entry or overwrites that variable's value for that day. habitId is the tracker id and subvariableId the variable id from list_trackers or get_today. BOOLEAN variables take 1 or 0; SCALE_0_10 takes 0 to 10. If the tracker is the independent variable of an active experiment, compliance with that day's assignment is recorded and a warning is returned on mismatch. Requires a key with the write scope. |
| `get_entries` | `read` | Logged entries between two dates inclusive (at most 366 days), newest first, each with its tracker, note and variable values. |
| `get_correlations` | `read` | Statistically significant correlations between the user's variables, computed by Datalyst's stats engine (Pearson, or Spearman for 0 to 10 scales; Bonferroni corrected; at least 14 overlapping days; \|r\| > 0.3). Report these numbers as given; do not recompute them. Correlation is not causation. |
| `list_experiments` | `read` | List the user's Lab experiments (N=1 trials), newest first, optionally filtered by status. |
| `create_experiment` | `write` | Create a Lab experiment testing whether one tracker (independentId) affects another (dependentId). Both ids are tracker ids from list_trackers and must differ. Must last at least 7 days. RANDOMIZED and BLIND_RCT types get a blocked randomization schedule; blockSize must be a multiple of the number of conditions. Requires a key with the write scope. |
| `get_experiment_results` | `read` | Results for one experiment from Datalyst's stats engine: daily chart data, effect size, p values, Bayesian posterior and a plain language interpretation. While an experiment is ACTIVE only progress is returned, to prevent peeking bias. Report these numbers as given; do not recompute them. |
| `export_data` | `read` | Full JSON export of the user's account: profile, trackers, entries, templates, experiments and logs. Large; prefer get_entries for a date range. |
<!-- tools:end -->

Every tool runs as the key's owner, through the same services the app uses. No statistics are computed
in the MCP layer: numbers come from the stats engine, and tools that return study or experiment results
carry their limitations in the description so an agent can quote them.

## Rate limits

| Aspect | Behaviour |
| --- | --- |
| Window | fixed 60 seconds, counted per bucket key |
| Limit | the key's `rateLimitPerMinute` (default 60, minimum 1) |
| Buckets | `mcp:<apiKeyId>` for MCP; `agent:<apiKeyId>:trial`, `:log`, `:results` for the REST routes — so a busy MCP session does not starve a log endpoint |
| Over the limit | MCP: HTTP 429 with `Retry-After`, body is JSON-RPC error `-32002`. REST: HTTP 429 with `retryAfterSeconds`, `Retry-After` and `X-RateLimit-Limit/Remaining/Reset` |
| Cost of a call | one HTTP request is one charge. JSON-RPC batches are rejected (`-32600`), so one request can never run several tools |
| Where it runs | in-process, in a `Map` on `globalThis`. On Cloudflare Workers each isolate has its own map |

The last row is the honest limit: the counter is **per instance**, not global. It protects a single
process from a runaway client; it is not a spend guarantee across isolates or regions. Anything that
needs a hard global limit belongs at the edge or in the database, and does not exist yet.

## Two enrollment paths for a host app

**1. Light path — shipped.** The host app links to the study; the participant enrols inside Datalyst.

1. The researcher imports or drafts a protocol and approves recruitment in `/lab/studies`. That freezes
   the protocol hash and shows the invitation link `https://www.datalyst.one/join/<joinCode>`.
2. The host app shows that link. The participant signs in to Datalyst (or creates an account), sees the
   full protocol, the researcher contact and the built-in data disclosure, and ticks an **unchecked**
   opt-in.
3. `POST /api/studies/join/<joinCode>` with `{ protocolHash, accepted: true }` creates the consent
   record, the participant row, an immutable randomized assignment snapshot, two study trackers and a
   planning experiment, in one serialized transaction. The consent record binds the hash the person saw.
4. The participant logs the outcome through Check-in. The researcher reads pseudonymous evidence in Lab
   or over MCP (`get_study_evidence`).

Why it is the right first path: consent is collected by the controller of the data, on the surface that
holds the data, with the hash of the exact text. The participant can withdraw from
`/lab/studies/<id>/participation` at any time, and withdrawal excludes their observations from every
future export.

**2. Deep path — not built.** Server-to-server enrolment: the host app collects consent in its own UI and
posts a signed record.

It is a better product for a clinic with its own portal and a much harder legal object: whose consent
counts, who can withdraw, who is the controller, what happens when the two systems disagree about the
consent text. Nothing in the code supports it — there is no signed-record endpoint, no host-app
credential, no reconciliation. It is documented here so it is a decision, not an oversight. Do not build
it before the light path has real studies.

## Discovery files

| File | Content |
| --- | --- |
| `/.well-known/api-catalog` | RFC 9727 linkset: OpenAPI, docs, and the MCP server |
| `/.well-known/openapi.json` | OpenAPI 3.0.3 for the discovery surface |
| `/.well-known/agent-skills/index.json` | Agent Skills index, one entry, with a `sha256:` digest of the skill file |
| `/.well-known/agent-skills/datalyst-agent-api/SKILL.md` | the skill itself (static file in `public/`) |
| `/agent.md`, `/auth.md` | markdown for agents: what Datalyst is, how to authenticate |
| `/api/openapi.json`, `/docs/agent-api` | the older agent API reference |

`src/lib/integrations-doc.test.ts` also checks that the digest in `index.json` matches the shipped
`SKILL.md`, so editing one without the other fails the build.

## Worked example

Synthetic values. Replace the key and the dates.

```sh
KEY=dl_…   # created in Settings, scopes: read, research:read, research:write

# 1. What does a valid protocol look like?
curl -s https://www.datalyst.one/api/mcp \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_study_protocol_schema","arguments":{}}}'

# 2. Save a draft. This never recruits anybody and never accepts consent.
curl -s https://www.datalyst.one/api/mcp \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_study_draft","arguments":{
        "name":"Morning walk pilot",
        "protocol":{
          "schemaVersion":"datalyst.study.v1",
          "hypothesis":"A short morning walk improves self-reported focus compared with a usual morning.",
          "consentText":"Voluntary pilot. Track daily focus after a usual morning or a short walk. Stop if uncomfortable.",
          "researcherContact":"study-team@example.invalid",
          "startDate":"2026-12-01","durationDays":14,
          "intervention":{"name":"Morning routine","a":"Usual morning","b":"Short morning walk"},
          "outcome":{"name":"Daily focus","unit":"points","min":0,"max":10},
          "analysis":"mean-difference-B-minus-A/DL-v1"}}}}'

# 3. Open recruitment and copy the join link in Lab, then:
curl -s https://www.datalyst.one/api/mcp \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_studies","arguments":{}}}'

# 4. Read the pseudonymous evidence packet (owner or granted analyst only).
curl -s https://www.datalyst.one/api/mcp \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_study_evidence","arguments":{"studyId":"<id>"}}}'
```

`create_study_draft` returns `{ id, name, status: "DRAFT" }`. It does **not** return the join code: the
invitation link is shown only in Lab, after the researcher has reviewed the protocol and opened
recruitment.

## What the surface cannot do yet

These are the four gaps that separate "an agent can start a study" from "an app can host one". None is
implemented, and none should be faked by a client.

1. **Opening and closing recruitment.** No MCP tool. `POST /api/studies/<id>` with
   `{ "action": "recruit" | "close" }` exists but is session-only, so an agent that drafts a study must
   hand the researcher back to the web app for the one action that creates obligations. This is
   deliberate for now and is the first thing to revisit, because it is also the action that most needs
   a human.
2. **Editing a draft protocol.** `create_study_draft` is create-only. There is no `update_study_draft`,
   so a typo in a draft means a new draft. The invariant behind it — a protocol cannot change once
   recruitment opens, because the consent record binds its hash — is correct and must survive any
   editor.
3. **Study-scoped keys.** A key is account-wide: `read`/`write` reach every tracker the person ever
   created, and `research:read` reaches every study they are a member of. A third-party host app
   therefore needs a broader key than its job requires. There is no `studyId` on `ApiKey` and no tool
   allowlist.
4. **An audit trail of agent actions.** `lastUsedAt` records that a key was used, not what it did. There
   is no row per write naming the key, tool, study and time, so "what did the agent do to my account"
   cannot be answered from the database.

Two smaller gaps worth naming: the older `/api/v1/agent/*` REST routes predate studies and cannot touch
them, and `export_data` (whole account) is the only export tool — there is no per-study export over MCP,
because `get_study_evidence` already returns the packet and a CSV needs the session route.
