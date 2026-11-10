# Health import connections and concurrency

Status: current

Health import requires an explicit device connection bound to the signed-in account and health source. `POST /api/health/connection` checks the account the user connected against the session, records health-data consent, and issues the connection ID. Local settings use `datalyst:health-v2:<userId>`. Unbound v1 settings are discarded; existing installations must connect again. No health data is transferred automatically to a second account on the same phone.

Each import carries the connection ID; the server checks owner, source, active status and current consent. Account switching during a native read cancels the batch before posting, and the server rejects any stale request submitted with another account's connection. OS read permission alone does not authorize importing into a different Datalyst account.

All imports, connection creation/replacement and disconnect/deletion acquire `SELECT ... FOR UPDATE` on the owner's User row inside a PostgreSQL transaction. Disconnect with retained data revokes the device connection. Deleting all imported data revokes every health-import connection for the account. An import that started first commits before deletion; an import that starts afterward sees revocation and fails. A delayed request cannot recreate data after deletion. Other devices must reconnect after deletion.

Within an import, existing tracker entries are locked before the import plan is read. A concurrent manual edit either commits first and is observed as `source = null`, or applies after the import transaction releases the entry lock. Existing manual values are never replaced by stale import plans. The partial unique index still prevents duplicate imported entries per tracker/day. Concurrent creation of a new manual entry can coexist with an imported entry because the product supports multiple entries per day; future imports recognize the manual day and skip it.

The health migration is idempotent PostgreSQL DDL, including the new HealthImportConnection table and RLS. Apply it after review before deploying this code, by hand or through `prisma migrate deploy` once the database is baselined (`docs/MIGRATION_BASELINE.md`). No production schema, native permissions, store release, or real health samples are changed by the implementation or tests.

Offline tests cover account isolation, a switch during native reads, connection-bound requests, consent refusal, idempotent retries, manual-edit rechecks, and an import/delete interleaving. Tests simulate the database lock discipline; live PostgreSQL concurrency and native HealthKit/Health Connect reads still need operator validation with a test account/device.
