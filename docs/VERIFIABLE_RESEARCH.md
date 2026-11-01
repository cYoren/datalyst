# Verifiable research records

An experiment has two immutable, owner-only records: the plan at hypothesis lock and observations at completion. Results refer to the plan's EAS UID (`refUID`) and snapshot hash. Recursive canonical JSON includes nested observations and arrays. A random nonce in each private snapshot protects low-entropy plans from simple dictionary matching against public hashes. Signatures establish content integrity and signer control, not collection accuracy, causation, reproducibility, ethics approval, or medical validity.

## Configuration and operations

Copy the placeholders from `.env.attestations.example` into server environment settings. `ATTESTATION_MODE=offchain` is the default. Only `EAS_SIGNER_PRIVATE_KEY` is needed to sign. No wallet, RPC, ETH, or schema registration is required for the user. Missing keys preserve frozen snapshots and show an unavailable signing state; owner-only Retry signing signs the original snapshot later. The signature records its actual signing time. Neither that time nor the database lock time is an independent public timestamp.

Optional `ATTESTATION_MODE=onchain` uses Base mainnet, chain ID 8453, EAS contract `0x4200000000000000000000000000000000000021`, EAS domain version 1.0.1. The mode is fixed when the plan is locked; changing the environment does not convert old records. Results in this mode require an existing onchain preregistration, never an offchain UID. Only ABI encoded SHA-256 hashes enter attestation data. Transaction metadata, signer address, timing and link UIDs are public; hashes are permanent and are not anonymized personal-data storage.

Schema registration is an explicit operator action, never part of app startup or migrations:

```sh
node scripts/register-eas-schemas.mjs # dry run, prints deterministic schema UIDs
# When funded and explicitly authorized:
node --env-file=.env.local scripts/register-eas-schemas.mjs --register
```

Set the printed `EAS_PREREG_SCHEMA_UID` and `EAS_RESULTS_SCHEMA_UID` after registration. The app checks chain ID, registered schema text, zero resolver and non-revocability. Results reference the same signer's preregistration. Keep the original signer available for the lifetime of each trial; rotation to a different signer cannot silently continue its proof chain.

Apply `prisma/migrations/20261007153000_experiment_attestations/migration.sql` manually after review and before deploying code. It is idempotent PostgreSQL DDL; do not run `prisma migrate deploy` against the legacy SQLite migration history. The new table enables RLS with no browser policies: access goes through the authorized server. This implementation does not apply a migration, deploy, fund an account, register schemas, or submit a transaction during tests.

## Idempotency and recovery

The owner row lock serializes lifecycle updates and frozen snapshot creation. A unique `(experimentId, kind)` prevents duplicate stages. Completed/archived trials cannot restart, and locked plan fields cannot change. Completion never implicitly makes a record public. Tracker entries can still be corrected; completed Lab/API/MCP results read the frozen observations, including both variables and daily aggregation, and remain unchanged. Legacy trials can complete, but no preregistration is fabricated retroactively and their result views remain live. The proof commits to observations; computed statistics still depend on the app's statistical engine version.

Signing uses an atomic claim so concurrent retries issue one signature. Onchain sends reserve `SUBMITTING` before calling RPC and save the transaction hash before waiting for confirmation. Retries with a known hash only inspect that transaction. A timeout/crash with `SUBMITTING` and no hash is deliberately not resent: an operator must reconcile wallet nonce/chain history before changing state. This favors avoiding duplicate public commitments over automatic recovery. A stuck `SIGNING` claim after a process crash can be reset to `UNAVAILABLE` by an operator because offchain signing has no network side effect. No general background worker is introduced.

Public share pages and social previews also read frozen observations and check both snapshot hashes and their link. They fail closed if frozen evidence is corrupted. They expose derived summaries only, never the private snapshot bundle. Legacy summaries remain live and include the full final UTC logical day.

## Verification and privacy

Lab exposes an owner-only JSON export at `GET /api/experiments/[id]/attestations`, and retry at POST to the same path. The public `/verify` page accepts a pasted bundle and checks hashes, EAS V2 signatures, domain, UID, schema, signer consistency and preregistration link. Onchain bundles query the Base EAS contract and require live RPC configuration. Verification without keys works for offchain signatures; `EAS_TRUSTED_SIGNER_ADDRESS` can identify the expected signer. Otherwise a cryptographically valid arbitrary signer is clearly shown as untrusted.

Bundles contain sensitive experiment data. The verifier sends pasted JSON to the server for transient verification and does not store it. Export endpoints send private/no-store headers; snapshots are never exposed by public experiment lookup. Deleting the experiment/user cascades database snapshots; it cannot remove any optional onchain hash. An offchain signature can be retained independently by its recipient.

## Primary protocol references

- [EAS SDK offchain versioning and verification](https://docs.attest.org/docs/developer-tools/eas-sdk)
- [EAS SDK V2 typed fields and UID algorithm](https://github.com/ethereum-attestation-service/eas-sdk/blob/master/src/offchain/offchain.ts)
- [Base deployment addresses and versions](https://docs.attest.org/docs/quick--start/contracts)
- [Schema registration and records](https://docs.attest.org/docs/tutorials/create-a-schema)
- [Schema UID implementation](https://github.com/ethereum-attestation-service/eas-contracts/blob/master/contracts/SchemaRegistry.sol)

## Validation

Public verification applies a60request/minute instance-wide cap before cryptographic or RPC work. Multi-instance deployments should also configure a shared edge/WAF limit; the in-process cap is not a global provider-spend guarantee. The legacy agent results URL now delegates to the same owner-bound frozen-results service and preserves active-trial gating. Public Base badges read confirmed result records rather than legacy experiment fields.

Offline Vitest coverage uses generated disposable keys and synthetic records. It covers nested hash changes, canonical ordering, altered signatures/domain/schema/refUID, linked results, ownership, immutable plans, unavailable configuration and duplicate claims. Optional onchain submission is not live-tested without operator-provided keys and ETH. Build and mobile layout checks use local synthetic data only.
