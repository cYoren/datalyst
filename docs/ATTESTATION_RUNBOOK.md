# Attestation operator runbook

Status: current. For the person operating a Datalyst deployment. Written so it can be executed top to
bottom without reading the code. Nothing in this document was executed while it was written: no funding,
no schema registration, no transaction, no key generation.

The behaviour it operates is described in [`VERIFIABLE_RESEARCH.md`](VERIFIABLE_RESEARCH.md); this file is
the order of operations.

## What is being operated

An experiment gets two immutable records: the plan when the hypothesis is locked (`PREREG`) and the
observations when it completes (`RESULTS`). Each record is a canonical JSON snapshot, hashed with SHA-256,
and either signed locally (offchain) or written to Base mainnet through EAS (onchain).

Hosted studies create a planning experiment, so the plan of every enrolled study participant is attested
the same way at activation. There is no separate study attestation path.

| Piece | Where |
| --- | --- |
| Table | `ExperimentAttestation`, one row per `(experimentId, kind)`, unique |
| Migration | `prisma/migrations/20261007153000_experiment_attestations/migration.sql` |
| Code | `src/lib/crypto/eas.ts`, `src/services/attestation.service.ts` |
| Owner export / retry | `GET` and `POST /api/experiments/<id>/attestations` |
| Public verification | `/verify` (pasted bundle, no account needed) |
| Schema registration | `scripts/register-eas-schemas.mjs` — manual, never run at startup |
| Schemas | `bytes32 preregistrationHash`, `bytes32 resultsHash` |

Both schemas are hash-only: only an ABI-encoded SHA-256 enters attestation data. Experiment text, IDs,
tracker names and observations never leave the database.

## Environment variables

Set these in the deployment's **server** environment (provider secrets). None of them may be prefixed
`NEXT_PUBLIC_`, and none may be committed.

| Variable | Required for | If it is missing |
| --- | --- | --- |
| `ATTESTATION_MODE` | `offchain` (default) or `onchain` | defaults to `offchain`. Any other value throws inside the lock transaction, so the lock fails and nothing is written — it is read when a plan is locked, never at completion. Validate the value before the first trial |
| `EAS_SIGNER_PRIVATE_KEY` | signing, both modes | `UNAVAILABLE`; snapshots stay frozen and the owner can retry later |
| `EAS_TRUSTED_SIGNER_ADDRESS` | optional | verification still works, but a valid signature from an arbitrary signer is shown as **untrusted** |
| `BASE_RPC_URL` | onchain mode, and verifying onchain bundles | onchain records become `UNAVAILABLE`; offchain records are unaffected |
| `EAS_PREREG_SCHEMA_UID` | onchain mode | onchain `PREREG` becomes `UNAVAILABLE` unless it equals the deterministic UID |
| `EAS_RESULTS_SCHEMA_UID` | onchain mode | same for `RESULTS` |

The two schema UIDs are deterministic and can be printed without a wallet:

```sh
node scripts/register-eas-schemas.mjs
# EAS_PREREG_SCHEMA_UID=0x0741aecd3e7acf996845d324f01b1be13a79148ff9c4d26f015c8652cbef94f6
# EAS_RESULTS_SCHEMA_UID=0xf9819726ed8ec12d53b6d994673593f185dca5237c0e4ace0644eaf55eb4ae0a
```

The app refuses to submit when the configured UID does not match the deterministic one for the schema
text, which is what catches a copy-paste error from another deployment.

## Order of operations

### Stage 0 — prerequisites (human, outside the app)

1. Decide the mode for **new** trials. `offchain` is the default and needs only a signer key. `onchain`
   additionally needs a funded Base signer and the two schemas registered.
2. Provision a dedicated signer: a fresh key in your own keystore or hardware wallet, used for nothing
   else. Do not reuse a personal wallet, and do not use the same key across deployments. Generating that
   key is the operator's action; it is not part of this repository.
3. Record where the key is backed up, and who can reach it. Losing it ends the proof chain for trials in
   progress (see "Signer lifetime" below).

### Stage 1 — database (before the code that uses it)

The table must exist before the release that writes to it. On a hosted database that has not been
baselined yet, do [`MIGRATION_BASELINE.md`](MIGRATION_BASELINE.md) first; it is a separate, one-time
procedure and it is what makes `prisma migrate deploy` usable at all.

```sh
# 1. Confirm the target and that the baseline is in place (read-only).
psql "$DATABASE_URL" -f docs/sql/migration-inventory.sql

# 2. Take a snapshot. Additive DDL, but a snapshot is the only rollback that needs no reasoning.

# 3. Apply.
npx prisma migrate deploy
# or, by hand, on a database whose history you have already reconciled:
#   psql "$DATABASE_URL" -f prisma/migrations/20261007153000_experiment_attestations/migration.sql

# 4. Verify the table, its unique key and RLS.
psql "$DATABASE_URL" -c '\d "ExperimentAttestation"'
psql "$DATABASE_URL" -c 'SELECT relrowsecurity FROM pg_class WHERE oid = '\''public."ExperimentAttestation"'\''::regclass'
```

Expected: the table with a unique `(experimentId, kind)` index, a cascading foreign key to `Experiment`,
and `relrowsecurity = t`. There are no browser policies and no `anon`/`authenticated` grants by design:
access is server-side only.

### Stage 2 — offchain (the default, no chain access needed)

1. Set `ATTESTATION_MODE=offchain`, `EAS_SIGNER_PRIVATE_KEY`, and optionally
   `EAS_TRUSTED_SIGNER_ADDRESS` (the address derived from that key).
2. Deploy or restart the app so the new environment is read.
3. Verify on a non-production deployment first, with a throwaway account:
   - create a Lab experiment, lock the hypothesis (status → `ACTIVE`), complete it;
   - `GET /api/experiments/<id>/attestations` returns a bundle with `PREREG` and `RESULTS`, both `SIGNED`
     or `CONFIRMED`, each with `uid`, `proof.signature` and `dataHash`;
   - paste that bundle into `/verify`: hashes, domain, UID, schema, signer consistency and the
     preregistration link must all pass;
   - edit a tracker entry of the completed experiment, then re-open the export: the frozen `RESULTS`
     snapshot must not change.
4. Only then enable it in production.

What offchain means: a locally produced EAS V2 signature over the snapshot hash. No RPC, no ETH, no
schema registration, no public record. The signing time is asserted by the signer, not independently
timestamped. The signature proves content integrity and signer control — nothing about collection
accuracy, causation, ethics approval or medical validity.

### Stage 3 — onchain (optional, opt-in, owner-funded)

Do this only with explicit authorisation to spend ETH, and only for new trials: **the mode is fixed when
a plan is locked**, so changing `ATTESTATION_MODE` does not convert existing records.

1. Fund the signer address on Base mainnet (chain ID 8453). This is the operator's action.
2. Set `BASE_RPC_URL` to a Base mainnet endpoint. The registration script refuses any other chain.
3. Register the two schemas (idempotent: it checks `getSchema` first and skips what exists):

   ```sh
   node --env-file=.env.local scripts/register-eas-schemas.mjs --register
   ```

   This sends transactions and costs gas. It is never part of app startup or a migration.
4. Set `EAS_PREREG_SCHEMA_UID` and `EAS_RESULTS_SCHEMA_UID` to the printed values, then restart.
5. Verify on a throwaway experiment:
   - locking the plan writes a `PREREG` row with a `txHash` and then a `uid`, status `CONFIRMED`;
   - completing it writes `RESULTS` whose `refUID` is that `PREREG` UID, from the same signer;
   - `/verify` passes with live RPC, and the transaction is visible on a Base explorer.

Contract facts the app enforces, for reference: EAS `0x4200000000000000000000000000000000000021`,
schema registry `0x4200000000000000000000000000000000000020`, EAS domain version `1.0.1`, zero resolver,
non-revocable schemas.

### Order summary

```
snapshot → baseline (if needed) → migration → env (offchain) → restart → verify offchain
        → [ optional: fund → register schemas → schema UIDs → restart → verify onchain ]
```

The migration always comes before the code. The signer key always comes before the first lock. Schema
registration comes before the first onchain lock, never after.

## offchain versus onchain

| | `offchain` (default) | `onchain` |
| --- | --- | --- |
| Needs | signer key | signer key, funded Base address, `BASE_RPC_URL`, registered schemas, both UIDs |
| Public record | none | transaction, signer address, timing, UID, link UIDs |
| Cost | none | gas per attestation |
| Signature lifetime | as long as the bundle is kept | permanent on Base |
| Verification | offline, no RPC | live RPC required |
| Can be deleted | yes, with the account | the hash is permanent and cannot be removed |
| Results prerequisite | the `PREREG` proof from the same signer | an onchain `PREREG` by the same signer, never an offchain UID |
| Failure mode | `UNAVAILABLE`, retryable by the owner | `UNAVAILABLE` (config) or `SUBMITTING` (needs an operator) |

Neither mode makes a record public on its own: completion never publishes personal data, and the public
share pages read frozen observations only.

## Signer lifetime

**The signer must stay available for the life of every trial it attested.** Concretely:

- `RESULTS` in offchain mode is refused unless the original `PREREG` proof was signed by the same key
  ("Original preregistration signer required").
- `RESULTS` in onchain mode is refused unless the referenced `PREREG` attestation was made by the same
  signer address.
- A rotation therefore does not "continue" a proof chain; it starts a new one. Existing trials keep their
  frozen snapshots and their existing signatures, and any trial that has not completed can no longer get
  its `RESULTS` proof from the old key.
- Consequences to plan for: back the key up before the first lock; do not rotate during an active trial;
  if the key is lost, treat the affected trials as unattested results — the data is intact, the proof of
  the observations is not.

## Incidents and recovery

| Symptom | Cause | Action |
| --- | --- | --- |
| Row `UNAVAILABLE`, no `uid` | missing key, wrong mode config, wrong schema UID, signer mismatch | fix the environment, then the owner presses retry (`POST /api/experiments/<id>/attestations`) |
| Row stuck `SIGNING` | process died between claim and signature | safe to reset: offchain signing has no external side effect (SQL below) |
| Row stuck `SUBMITTING`, with `txHash` | process died while waiting for the receipt | do nothing; the next retry inspects that transaction only |
| Row stuck `SUBMITTING`, **no** `txHash` | process died after reserving but before saving the hash | **do not resend.** Reconcile the signer's nonce and the chain history by hand, then decide |
| `/verify` fails on an onchain bundle | no `BASE_RPC_URL`, wrong chain, or corrupted snapshot | configuration first, then compare `dataHash`; a hash mismatch means the bundle was altered |
| `/verify` shows "untrusted signer" | `EAS_TRUSTED_SIGNER_ADDRESS` unset or different | expected until the allowlist is configured; the signature is still valid |

Resetting a stuck `SIGNING` claim (operator, server-side, no app change needed):

```sql
UPDATE "ExperimentAttestation"
SET status = 'UNAVAILABLE', "updatedAt" = now()
WHERE status = 'SIGNING' AND "updatedAt" < now() - interval '15 minutes';
```

Never do that for `SUBMITTING`. A duplicate public commitment is worse than a missing one.

Monitoring worth a daily glance:

```sql
SELECT mode, kind, status, count(*) FROM "ExperimentAttestation" GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

SELECT id, "experimentId", kind, status, "updatedAt" FROM "ExperimentAttestation"
WHERE status IN ('SIGNING', 'SUBMITTING') AND "updatedAt" < now() - interval '1 hour';
```

The second query returning rows is the only alert that matters: it means someone is waiting on a proof
that will never arrive on its own.

## Rollback

- **Disable signing:** remove `EAS_SIGNER_PRIVATE_KEY` and restart. Frozen snapshots and existing
  signatures stay; new records go `UNAVAILABLE` and can be signed later. Nothing is lost.
- **Revert the release:** the table is additive and the previous release does not read it, so code can
  roll back while the migration stays.
- **Drop the table:** only from a snapshot restore, and only if you accept losing every frozen snapshot.
  Onchain hashes are already public and cannot be removed by anything you do here.
- **Never** `prisma migrate reset` or `db push` on a hosted database.

## Verification checklist for a release that touches attestations

```sh
npx prisma validate
npx prisma generate
npx vitest run src/lib/crypto/eas.test.ts src/services/attestation.service.test.ts src/app/api/verify/route.test.ts
npx tsc --noEmit
```

Then, by hand on a non-production deployment: lock a plan, complete it, export the bundle, paste it into
`/verify`, edit a tracker entry and confirm the frozen snapshot did not move. That last step is the one
that catches a regression the unit tests cannot see.
