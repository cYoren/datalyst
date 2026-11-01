// Offline renderer only: no database connector, dotenv, Prisma config or env URL.
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const migrationPaths = [
  '20261006000000_api_key_hashes', '20261006120000_health_import',
  '20261007120000_add_studies', '20261007150000_ai_insights',
  '20261007153000_experiment_attestations',
].map(name => `prisma/migrations/${name}/migration.sql`);
export const serverOnly = ['ApiKey', 'Assignment', 'Protocol', 'HealthImportConnection', 'Study', 'StudyMember', 'StudyParticipant', 'StudyConsent', 'AiDailyUsage', 'InsightsCache', 'ExperimentAttestation'];
const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => `'${value.replaceAll("'", "''")}'`;

// Intentionally supports only the unmapped scalar types present in these pinned
// schemas. A future unsupported schema feature must fail rather than weaken checks.
// The default as PostgreSQL's pg_get_expr() prints it for Prisma's generated DDL, or null when
// Prisma creates no database default (no @default, or client-side cuid()/uuid()). Unknown
// forms throw so a new schema feature gets an explicit review instead of a weaker check.
export function defaultExpression(line, prismaType, isList, enums) {
  const start = line.indexOf('@default(');
  if (start < 0) return null;
  let depth = 0, end = start + 8;
  for (; end < line.length; end++) { if (line[end] === '(') depth++; if (line[end] === ')' && --depth === 0) break; }
  const arg = line.slice(start + 9, end).trim();
  const literal = text => `'${text.replaceAll("'", "''")}'`;
  if (/^(cuid|uuid)\(\)$/.test(arg)) return null;
  if (arg === 'now()') return 'CURRENT_TIMESTAMP';
  if (isList) {
    const items = JSON.parse(arg), pgType = { String: 'text', Int: 'integer' }[prismaType];
    if (!pgType || !Array.isArray(items)) throw new Error(`Unsupported list default: ${line.trim()}`);
    if (!items.length) return `ARRAY[]::${pgType}[]`;
    if (prismaType !== 'String') throw new Error(`Unsupported list default: ${line.trim()}`);
    return `ARRAY[${items.map(item => `${literal(item)}::text`).join(', ')}]`;
  }
  if (enums.some(item => item.name === prismaType)) return `${literal(arg)}::"${prismaType}"`;
  if (prismaType === 'Boolean' && /^(true|false)$/.test(arg)) return arg;
  if ((prismaType === 'Int' || prismaType === 'Float') && /^\d+(\.\d+)?$/.test(arg)) return arg;
  if ((prismaType === 'String' || prismaType === 'Json') && /^".*"$/.test(arg)) return `${literal(JSON.parse(arg))}::${prismaType === 'Json' ? 'jsonb' : 'text'}`;
  throw new Error(`Unsupported default: ${line.trim()}`);
}

export function catalog(schema) {
  if (/@(?:@)?map\(/.test(schema)) throw new Error('Mapped schema names need an explicit rollout review');
  const modelNames = new Set([...schema.matchAll(/model\s+(\w+)\s*\{/g)].map(match => match[1]));
  const enums = [...schema.matchAll(/enum\s+(\w+)\s*\{([^}]+)\}/g)].map(([, name, body]) => ({ name, labels: body.split('\n').map(line => line.split('//')[0].trim()).filter(Boolean) }));
  const types = { String: 'text', Int: 'int4', Float: 'float8', Boolean: 'bool', DateTime: 'timestamp', Json: 'jsonb', ...Object.fromEntries(enums.map(item => [item.name, item.name])) };
  const models = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(([, table, body]) => ({ table, columns: body.split('\n').flatMap(line => {
    const field = line.match(/^\s*(\w+)\s+(\w+)(\[\])?(\?)?(?:\s|$)/);
    if (!field) return [];
    if (!types[field[2]]) {
      if (modelNames.has(field[2])) return [];
      throw new Error(`Unsupported schema type: ${field[2]}`);
    }
    // Prisma emits NOT NULL for required scalars; lists are left out because their nullability varies.
    return [{ table, column: field[1], type: `${field[3] ? '_' : ''}${types[field[2]]}`, notNull: field[3] ? null : !field[4],
      defaultExpr: defaultExpression(line, field[2], !!field[3], enums) }];
  }) }));
  if (!models.length) throw new Error('No schema models found');
  return { enums, models, columns: models.flatMap(model => model.columns) };
}

function catalogCheck(current, legacy, final = false) {
  const requiredTables = new Set((final ? current : legacy).models.map(model => model.table));
  const requiredColumns = new Set((final ? current : legacy).columns.map(column => `${column.table}.${column.column}`));
  // Columns new in 1.1 may already exist from a partial or manual rollout; CREATE ... IF NOT EXISTS
  // would not repair them, so their nullability and defaults must match before they are accepted.
  const legacyColumns = new Set(legacy.columns.map(column => `${column.table}.${column.column}`));
  return `DO $$\nDECLARE expected RECORD; actual_type TEXT; actual_not_null BOOLEAN; actual_default TEXT;\nBEGIN\n  IF current_setting('server_version_num')::integer < 140000 OR pg_is_in_recovery() THEN RAISE EXCEPTION 'Requires writable PostgreSQL 14+ primary'; END IF;\n  FOR expected IN SELECT * FROM (VALUES\n${current.columns.map(column => `    (${quote(column.table)}, ${quote(column.column)}, ${quote(column.type)}, ${requiredTables.has(column.table)}, ${requiredColumns.has(`${column.table}.${column.column}`)}, ${!legacyColumns.has(`${column.table}.${column.column}`)}, ${column.notNull === null ? 'NULL::boolean' : column.notNull}, ${column.defaultExpr === null ? 'NULL::text' : quote(column.defaultExpr)})`).join(',\n')}\n  ) AS fields(table_name, column_name, type_name, required_table, required_column, is_new, not_null, default_expr) LOOP\n    IF to_regclass(format('public.%I', expected.table_name)) IS NULL THEN\n      IF expected.required_table THEN RAISE EXCEPTION 'Unsupported baseline: missing table %', expected.table_name; END IF;\n      CONTINUE;\n    END IF;\n    SELECT t.typname INTO actual_type FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid\n      WHERE a.attrelid = to_regclass(format('public.%I', expected.table_name)) AND a.attname = expected.column_name AND a.attnum > 0 AND NOT a.attisdropped;\n    IF actual_type IS NULL AND (expected.required_column OR NOT expected.required_table) THEN RAISE EXCEPTION 'Unsupported baseline: missing %.%', expected.table_name, expected.column_name; END IF;\n    IF actual_type IS NOT NULL AND actual_type <> expected.type_name THEN RAISE EXCEPTION 'Unsupported column type: %.%', expected.table_name, expected.column_name; END IF;\n    IF actual_type IS NOT NULL AND expected.is_new THEN\n      SELECT a.attnotnull, pg_get_expr(d.adbin, d.adrelid) INTO actual_not_null, actual_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum\n        WHERE a.attrelid = to_regclass(format('public.%I', expected.table_name)) AND a.attname = expected.column_name AND a.attnum > 0 AND NOT a.attisdropped;\n      IF expected.not_null IS NOT NULL AND actual_not_null <> expected.not_null THEN RAISE EXCEPTION 'Unsupported nullability: %.%', expected.table_name, expected.column_name; END IF;\n      IF actual_default IS DISTINCT FROM expected.default_expr THEN RAISE EXCEPTION 'Unsupported default: %.% is %, expected %', expected.table_name, expected.column_name, coalesce(actual_default, 'none'), coalesce(expected.default_expr, 'none'); END IF;\n    END IF;\n  END LOOP;\n${current.enums.map(item => `  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = ${quote(item.name)} AND n.nspname = 'public') THEN\n    IF EXISTS (SELECT label FROM unnest(ARRAY[${item.labels.map(quote).join(',')}]) label WHERE NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = ${quote(item.name)} AND e.enumlabel = label)) THEN RAISE EXCEPTION 'Unsupported enum: ${item.name}'; END IF;\n  ${legacy.enums.some(old => old.name === item.name) || final ? `ELSE RAISE EXCEPTION 'Missing enum: ${item.name}';` : ''} END IF;`).join('\n')}\nEND $$;\n`;
}

const duplicates = `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."ApiKey" GROUP BY encode(sha256(convert_to("key", 'UTF8')), 'hex') HAVING count(*) > 1 AND encode(sha256(convert_to("key", 'UTF8')), 'hex') IS NOT NULL) THEN RAISE EXCEPTION 'Duplicate legacy key hashes require manual review'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ApiKey' AND column_name = 'scopes') THEN
    IF EXISTS (SELECT 1 FROM public."ApiKey" WHERE scopes IS NULL) THEN RAISE EXCEPTION 'NULL API scopes require explicit operator review'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Habit' AND column_name = 'healthMetric') THEN
    IF EXISTS (SELECT 1 FROM public."Habit" WHERE "healthMetric" IS NOT NULL GROUP BY "userId", "healthMetric" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate health trackers require manual review'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'HabitEntry' AND column_name = 'source') THEN
    IF EXISTS (SELECT 1 FROM public."HabitEntry" WHERE source IS NOT NULL GROUP BY "habitId", "logicalDate" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate imported days require manual review'; END IF;
  END IF;
END $$;\n`;

function securityCheck() {
  return `DO $$\nDECLARE table_name TEXT; role_name TEXT;\nBEGIN\n  FOREACH table_name IN ARRAY ARRAY[${serverOnly.map(quote).join(',')}] LOOP\n    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(format('public.%I', table_name))) THEN RAISE EXCEPTION 'RLS missing on %', table_name; END IF;\n    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP\n      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) AND (\n        has_table_privilege(role_name, format('public.%I', table_name), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR\n        has_any_column_privilege(role_name, format('public.%I', table_name), 'SELECT,INSERT,UPDATE,REFERENCES')\n      ) THEN RAISE EXCEPTION 'Browser privilege remains on % for %', table_name, role_name; END IF;\n    END LOOP;\n  END LOOP;\n  IF EXISTS (SELECT 1 FROM public."ApiKey" WHERE "key" IS NOT NULL AND ("keyHash" IS NULL OR prefix IS NULL)) THEN RAISE EXCEPTION 'Legacy API key backfill incomplete'; END IF;\n  IF NOT (SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public."ApiKey"'::regclass AND attname = 'scopes') THEN RAISE EXCEPTION 'API scopes must be NOT NULL'; END IF;\nEND $$;\n`;
}

// attnum=0 denotes an expression and disappears in the pg_attribute join below.
// Check the complete index shape first, including key vs INCLUDE attributes, so
// an extra expression cannot masquerade as uniqueness of the requested columns.
function plainUniqueIndex(columns) {
  return `i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND
      i.indexprs IS NULL AND i.indnkeyatts = cardinality(${columns}) AND i.indnatts = cardinality(${columns}) AND
      ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num, ordinal) JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.num ORDER BY k.ordinal) = ${columns}`;
}

function indexCheck() {
  const indexes = [
    ['ApiKey', 'ApiKey_keyHash_key', ['keyHash']], ['Habit', 'Habit_userId_healthMetric_key', ['userId', 'healthMetric']],
    ['HabitEntry', 'HabitEntry_imported_day_key', ['habitId', 'logicalDate'], true],
    ['Study', 'Study_joinCode_key', ['joinCode']], ['StudyMember', 'StudyMember_studyId_userId_key', ['studyId', 'userId']],
    ...['experimentId', 'outcomeHabitId', 'outcomeVariableId', 'interventionHabitId'].map(column => ['StudyParticipant', `StudyParticipant_${column}_key`, [column]]),
    ['StudyParticipant', 'StudyParticipant_studyId_userId_key', ['studyId', 'userId']], ['StudyParticipant', 'StudyParticipant_studyId_pseudonym_key', ['studyId', 'pseudonym']],
    ['StudyConsent', 'StudyConsent_participantId_key', ['participantId']], ['AiDailyUsage', 'AiDailyUsage_userId_day_key', ['userId', 'day']],
    ['ExperimentAttestation', 'ExperimentAttestation_experimentId_kind_key', ['experimentId', 'kind']],
  ];
  return `DO $$\nDECLARE expected RECORD; valid BOOLEAN;\nBEGIN\n  FOR expected IN SELECT * FROM (VALUES\n${indexes.map(([table, name, columns, partial]) => `    (${quote(table)}, ${quote(name)}, ARRAY[${columns.map(quote).join(',')}]::text[], ${!!partial})`).join(',\n')}\n  ) AS indexes(table_name, index_name, columns, partial) LOOP\n    SELECT ${plainUniqueIndex('expected.columns')} AND\n      CASE WHEN expected.partial THEN regexp_replace(pg_get_expr(i.indpred, i.indrelid), '[^a-zA-Z]', '', 'g') = 'sourceISNOTNULL' ELSE i.indpred IS NULL END\n      INTO valid FROM pg_index i WHERE i.indexrelid = to_regclass(format('public.%I', expected.index_name)) AND i.indrelid = to_regclass(format('public.%I', expected.table_name));\n    IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Required unique index missing or incompatible: %', expected.index_name; END IF;\n  END LOOP;\nEND $$;\n`;
}

function foreignKeyCheck() {
  const references = [
    ['HealthImportConnection', 'userId', 'User'], ['AiDailyUsage', 'userId', 'User'],
    ['ExperimentAttestation', 'experimentId', 'Experiment'],
    ['StudyMember', 'studyId', 'Study'], ['StudyMember', 'userId', 'User'],
    ['StudyParticipant', 'studyId', 'Study'], ['StudyParticipant', 'userId', 'User'],
    ['StudyConsent', 'participantId', 'StudyParticipant'],
  ];
  return `DO $$\nDECLARE expected RECORD;\nBEGIN\n  FOR expected IN SELECT * FROM (VALUES\n${references.map(([table, column, target]) => `    (${quote(table)}, ${quote(column)}, ${quote(target)})`).join(',\n')}\n  ) AS links(table_name, column_name, target_table) LOOP\n    IF NOT EXISTS (SELECT 1 FROM pg_constraint c\n      WHERE c.contype = 'f' AND c.convalidated AND c.confdeltype = 'c'\n      AND c.conrelid = to_regclass(format('public.%I', expected.table_name)) AND c.confrelid = to_regclass(format('public.%I', expected.target_table))\n      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = expected.column_name)]\n      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.confrelid AND attname = 'id')])\n    THEN RAISE EXCEPTION 'Required validated cascading foreign key missing: %.%', expected.table_name, expected.column_name; END IF;\n  END LOOP;\nEND $$;\n`;
}

function legacyConstraintCheck(schema) {
  const unique = [];
  const tables = [];
  for (const [, table, body] of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    tables.push(table);
    for (const line of body.split('\n')) {
      const field = line.match(/^\s*(\w+)\s+\w+\??\s+.*@unique(?:\s|$)/);
      if (field) unique.push([table, [field[1]]]);
      const compound = line.match(/@@unique\(\[([\w,\s]+)\]\)/);
      if (compound) unique.push([table, compound[1].split(',').map(column => column.trim())]);
    }
  }
  return `DO $$\nDECLARE expected RECORD; table_name TEXT;\nBEGIN\n  FOREACH table_name IN ARRAY ARRAY[${tables.map(quote).join(',')}] LOOP\n    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.contype = 'p' AND c.conrelid = to_regclass(format('public.%I', table_name)) AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'id')]) THEN RAISE EXCEPTION 'Unsupported baseline primary key: %', table_name; END IF;\n  END LOOP;\n  FOR expected IN SELECT * FROM (VALUES\n${unique.map(([table, columns]) => `    (${quote(table)}, ARRAY[${columns.map(quote).join(',')}]::text[])`).join(',\n')}\n  ) AS keys(table_name, columns) LOOP\n    IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = to_regclass(format('public.%I', expected.table_name)) AND i.indpred IS NULL AND\n      ${plainUniqueIndex('expected.columns')}) THEN RAISE EXCEPTION 'Unsupported baseline unique key: %.%', expected.table_name, expected.columns; END IF;\n  END LOOP;\nEND $$;\n`;
}

function policyCheck() {
  return `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY(ARRAY[${serverOnly.map(quote).join(',')}]))
    THEN RAISE EXCEPTION 'Unexpected policy on server-only table; review before rollout'; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
    THEN RAISE EXCEPTION 'Unexpected privileged browser role'; END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
      LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) p
      WHERE n.nspname = 'public' AND c.relname = ANY(ARRAY[${serverOnly.map(quote).join(',')}]) AND p.grantee = 0)
    THEN RAISE EXCEPTION 'PUBLIC server-table privilege remains'; END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace,
      LATERAL aclexplode(CASE WHEN cardinality(a.attacl) > 0 THEN a.attacl ELSE NULL END) p
      WHERE n.nspname = 'public' AND c.relname = ANY(ARRAY[${serverOnly.map(quote).join(',')}]) AND p.grantee = 0)
    THEN RAISE EXCEPTION 'PUBLIC column privilege remains'; END IF;
  END $$;\n`;
}

export function prepare() {
  const schema = readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const fixture = readFileSync(path.join(root, 'scripts/fixtures/legacy-schema-86f2192.prisma'), 'utf8');
  if (hash(fixture) !== 'cb354829c09379a6fdb8cdf5ad5bcc37bd695b351ef0e0e6a9ba96e254a849c1') throw new Error('Pinned legacy fixture changed; review its source commit before rollout');
  const current = catalog(schema), legacy = catalog(fixture);
  const inputs = [...migrationPaths, 'prisma/rollout/server-only.sql'].map(file => ({ file, sql: readFileSync(path.join(root, file), 'utf8') }));
  const identity = `SELECT current_database() AS database, current_user AS rollout_role, inet_server_addr() AS server_address, current_setting('server_version') AS postgres_version;\n`;
  const catalogPreflight = catalogCheck(current, legacy) + legacyConstraintCheck(fixture);
  const preflight = catalogPreflight + duplicates;
  const verify = catalogCheck(current, legacy, true) + indexCheck() + foreignKeyCheck() + policyCheck() + securityCheck();
  const apply = `-- REVIEWED ADDITIVE INPUTS; not a Prisma baseline or migration-history rewrite.\n-- No connection is made by the renderer. Confirm the target/backup before applying.\nBEGIN;\nSET LOCAL search_path = public;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '120s';\nDO $$ BEGIN IF NOT pg_try_advisory_xact_lock(1145132097, 11) THEN RAISE EXCEPTION 'Another Datalyst rollout is active'; END IF; END $$;\n${identity}${preflight}${inputs.map(input => `\n-- Input: ${input.file}\n${input.sql}`).join('\n')}\n${verify}COMMIT;\n`;
  const files = { 'catalog-preflight.sql': `BEGIN READ ONLY;\nSET LOCAL search_path = public;\nSET LOCAL statement_timeout = '60s';\n${identity}${catalogPreflight}COMMIT;\n`, 'preflight.sql': `BEGIN READ ONLY;\nSET LOCAL search_path = public;\nSET LOCAL statement_timeout = '60s';\n${identity}${preflight}COMMIT;\n`, 'apply.sql': apply, 'verify.sql': `BEGIN READ ONLY;\nSET LOCAL search_path = public;\n${identity}${verify}COMMIT;\n` };
  const manifest = { release: 'Datalyst 1.1', legacyFixtureCommit: '86f2192', productionTargetVerified: false, schemaSha256: hash(schema), legacyFixtureSha256: hash(fixture), inputs: inputs.map(input => ({ file: input.file, sha256: hash(input.sql) })), artifacts: Object.fromEntries(Object.entries(files).map(([name, sql]) => [name, hash(sql)])) };
  return { files, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: node scripts/prepare-db-rollout.mjs [--out DIRECTORY]; offline only');
  const { files, manifest } = prepare();
  if (args.length) {
    const output = path.resolve(args[1]); mkdirSync(output, { recursive: true, mode: 0o700 });
    for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(output, name), sql, { mode: 0o600 });
    writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    console.log(`Offline review bundle: ${output}`);
  }
  console.log(JSON.stringify(manifest, null, 2));
}
