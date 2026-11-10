# Studies roadmap: from shipped to easy to host

Status: current. This is the research-hosting track. It is not the AI copilot roadmap in
[`ROADMAP.md`](../ROADMAP.md); the two share the statistics engine and nothing else.

The capability is not missing. `docs/researcher-studies.md` describes what already runs in production:
a validated `datalyst.study.v1` protocol with a frozen hash, an invitation with an unchecked opt-in,
serialized idempotent enrolment, an immutable randomized assignment snapshot, a pseudonymous evidence
packet with DerSimonian–Laird meta-analysis, CSV and JSON export with a codebook, self-serve withdrawal,
and EAS attestations for plan and observations. `docs/INTEGRATIONS.md` documents the key, scope, MCP and
discovery surface an app or an agent uses to reach it.

What is missing is everything between "it works if you already know how" and "a researcher with a
spreadsheet can do this on a Monday". Three gaps, in dependency order.

## 1. A validated protocol editor instead of raw JSON import

**Today:** `/lab/studies` imports a `datalyst.study.v1` JSON document. A researcher who cannot write JSON
has to produce it with an AI assistant first. That is where most of them stop.

**What to build:** `/lab/studies/new`, a form over the schema that already exists at
`/api/studies/schema`. Fields: name, hypothesis, conditions A and B, outcome variable and unit with its
range, duration, start date, per-day expectation, consent text and researcher contact. Client and server
validate with the same schema; the form does not introduce a second definition of a protocol.

**Acceptance:**

- importing an existing `datalyst.study.v1` document still works, and the form and the import produce
  byte-identical protocols for the same inputs (a test compares the two paths, then the hash);
- an invalid duration, an outcome range where `min >= max`, an unknown property or a start date in the
  past is rejected before anything is saved, with the field named;
- no model call and no network request to a provider: this is a form.

**What it is not:** the "draft from a description" AI mode. That is capability A of the AI roadmap and
needs a provider decision. The editor is the surface it will plug into, not a substitute for it.

## 2. A power hint: minimum detectable effect for the planned sample

**Today:** nothing warns a researcher that 12 participants over 14 days cannot show the effect they care
about. The most common failure of a small pilot is that it was designed to fail.

**What to build:** on the editor and on the study dashboard, the minimum detectable effect for the
planned number of participants and observations, computed from the same variance formula the analysis
uses (`sA²/nA + sB²/nB`, per-participant mean difference `B − A`, inverse-variance weights). Show the
assumptions next to the number: alpha, power, the standard deviation assumed or observed, the number of
observations per condition, and the attrition already visible.

**Acceptance:**

- a unit test with known values reproduces the number by hand for at least two configurations;
- the assumptions are on screen, not in a tooltip, because a number without assumptions is a promise;
- it is computed locally from the protocol and the evidence the researcher already has. No model call;
- it says "unknown" rather than guessing when there is no variance to use yet.

**What it is not:** a stopping rule, a sequential test, or a promise that a significant result will
appear. The analysis stays exploratory, and the export keeps saying so.

## 3. A one-page study report with the attestation bundle

**Today:** the dashboard has the numbers and the export has the rows, but there is no single artifact a
researcher can attach to a submission or send to a supervisor.

**What to build:** one page per study, owner-shareable at a stable link, containing the protocol digest
and hash, enrolled and retained counts, exclusions with reasons, the effect with its interval and I², the
attestation bundle reference, and the limitations. Printable, so it can become the PDF an ethics
committee or a supervisor asks for.

**Acceptance:**

- it reads the same frozen evidence the export does and fails closed if a snapshot hash does not match,
  exactly like `/verify`;
- it never includes invitation codes, participant identities or researcher roles;
- the printed page carries the generation time and the app version, because a number without a date is
  not evidence;
- a test covers the corrupted-snapshot path, not just the happy one.

**What it is not:** an ethics submission or a regulatory dossier. It is the page that makes one possible.

## Order and dependencies

1. Editor first: the power hint needs the planned sample and duration the editor collects, and the report
   needs the protocol the editor produces.
2. Power hint second: it is the smallest change that prevents a wasted study, and it reuses the analysis
   variance.
3. Report third: it depends on both, and on the attestation export that already exists.

## Where this sits next to the rest

- **Phase 1 above** is the three gaps. It is small, has no external dependency, and makes the shipped
  capability usable.
- **Phase 1.5** is the integration surface: study-scoped keys, `open_recruitment` / `close_recruitment`
  and `update_study_draft` over MCP, and an audit trail of agent actions. `docs/INTEGRATIONS.md` lists
  those four as the current limits.
- **Phase 2** is what "hosting" really requires: a public study page, roles by invitation, more than two
  arms, washout and blinding, adherence monitoring, and an ethics pack. The decision record for that is
  `/home/gustvmar/Reports/datalyst-hosting-2026-11-09.md`, not this repository.

## Honest limits that stay in the product

Not an ethics board. Not a clinical trial platform. Two visible conditions, no blinding validation, no
monitoring board. Small samples produce intervals that are too narrow, and every export says so. Data is
pseudonymous, not anonymous, and a small group allows inference.

Positioning sentence: **run a small randomised pilot, preregistered and auditable, without a
statistician on call.**
