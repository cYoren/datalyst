import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalog, prepare, migrationPaths } from './prepare-db-rollout.mjs';

test('offline artifacts are deterministic, ordered, transactional and exclude environment secrets', () => {
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://SYNTHETIC_SECRET_SENTINEL@unrelated.invalid/never-connect';
  try {
    const first = prepare();
    assert.deepEqual(prepare(), first);
    assert.equal(migrationPaths.length, 5);
    assert.equal(first.manifest.productionTargetVerified, false);
    assert.doesNotMatch(JSON.stringify(first), /SYNTHETIC_SECRET_SENTINEL|unrelated\.invalid/);
    const apply = first.files['apply.sql'];
    assert.ok(apply.indexOf('BEGIN;') < apply.indexOf('ALTER TABLE'));
    assert.ok(apply.indexOf('pg_try_advisory_xact_lock') < apply.indexOf('ALTER TABLE'));
    assert.match(apply, /COMMIT;\n$/);
    for (let i = 1; i < migrationPaths.length; i++) assert.ok(apply.indexOf(migrationPaths[i - 1]) < apply.indexOf(migrationPaths[i]));
    const metadata = first.files['catalog-preflight.sql'];
    assert.match(metadata, /^BEGIN READ ONLY;/);
    assert.doesNotMatch(metadata, /ALTER |CREATE |DROP |INSERT |UPDATE |DELETE |pg_try_advisory|FROM public\."/);
    assert.match(first.files['preflight.sql'], /Duplicate imported days/);
    assert.match(first.files['verify.sql'], /Required unique index|Unexpected policy|PUBLIC column privilege/);
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});

test('catalog parser fails closed on unsupported scalar and mapped names', () => {
  assert.throws(() => catalog('model Example {\n id BigInt @id\n}\n'), /Unsupported schema type/);
  assert.throws(() => catalog('model Example {\n id String @id @map("other")\n}\n'), /Mapped schema/);
});
