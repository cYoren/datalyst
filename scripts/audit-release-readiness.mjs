#!/usr/bin/env node
// Prints presence/status and schema metadata only. Never prints secret values or rows.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.some(arg => !['--database', '--help'].includes(arg))) {
  console.error('Usage: node scripts/audit-release-readiness.mjs [--database]');
  process.exit(2);
}
if (args.includes('--help')) {
  console.log('Audit current process environment. --database adds a READ ONLY schema/security audit using DATABASE_URL. No dotenv loading, file writes, migrations, provider calls, or user-row queries. Exit 1 means incomplete readiness; exit 2 means audit unavailable.');
  process.exit(0);
}

const env = process.env;
const required = ['DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const present = key => Boolean(env[key]?.trim());
const missing = required.filter(key => !present(key));
const issues = [];
const validUrl = key => {
  try { return new URL(env[key]); } catch { return null; }
};
const databaseUrl = validUrl('DATABASE_URL');
const supabaseUrl = validUrl('NEXT_PUBLIC_SUPABASE_URL');
if (present('DATABASE_URL') && !['postgres:', 'postgresql:'].includes(databaseUrl?.protocol)) issues.push('DATABASE_URL must use PostgreSQL.');
if (present('NEXT_PUBLIC_SUPABASE_URL') && supabaseUrl?.protocol !== 'https:') issues.push('Supabase URL must use HTTPS.');
if (env.E2E_BYPASS_AUTH === '1') issues.push('E2E_BYPASS_AUTH must be disabled in release environments.');
for (const key of ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL']) {
  if (present(key) && validUrl(key)?.origin !== 'https://www.datalyst.one') issues.push(`${key} differs from the canonical native/web origin; confirm redirects and auth callbacks.`);
}

// Parse the allowlist from the provider source, rather than duplicating changing IDs.
const providerSource = readFileSync(new URL('../src/ai/providers/anthropic.ts', import.meta.url), 'utf8');
const allowedModels = [...new Set(providerSource.match(/claude-[a-z0-9-]+/g) || [])];
const modelAllowed = allowedModels.includes(env.ANTHROPIC_MODEL_ID);
const dailyLimit = Number(env.AI_DAILY_LIMIT_USD ?? '0.10');
const aiReady = present('ANTHROPIC_API_KEY') && modelAllowed && Number.isFinite(dailyLimit) && dailyLimit > 0;
const mode = env.ATTESTATION_MODE || 'offchain';
const modeValid = ['offchain', 'onchain'].includes(mode);
const signerValid = /^0x[0-9a-fA-F]{64}$/.test(env.EAS_SIGNER_PRIVATE_KEY || '');
const trustedSignerValid = /^0x[0-9a-fA-F]{40}$/.test(env.EAS_TRUSTED_SIGNER_ADDRESS || '');
let signerMatchesTrusted = false;
if (signerValid && trustedSignerValid) {
  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    signerMatchesTrusted = privateKeyToAccount(env.EAS_SIGNER_PRIVATE_KEY).address.toLowerCase() === env.EAS_TRUSTED_SIGNER_ADDRESS.toLowerCase();
  } catch { /* Invalid curve key or unavailable dependency: fail closed. */ }
}
const schemasPresent = ['EAS_PREREG_SCHEMA_UID', 'EAS_RESULTS_SCHEMA_UID'].every(key => /^0x[0-9a-fA-F]{64}$/.test(env[key] || ''));
const proofReady = modeValid && signerValid && trustedSignerValid && signerMatchesTrusted &&
  (mode === 'offchain' || (validUrl('BASE_RPC_URL')?.protocol === 'https:' && schemasPresent));
const hold = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).git?.deploymentEnabled?.main === false;

const report = {
  checkedAt: new Date().toISOString(),
  configuration: {
    required: Object.fromEntries(required.map(key => [key, present(key) ? 'present' : 'missing'])),
    missing, issues,
    databaseHost: databaseUrl?.hostname || null,
    supabaseHost: supabaseUrl?.hostname || null,
    ai: { ready: aiReady, apiKeyPresent: present('ANTHROPIC_API_KEY'), modelAllowed, dailyLimitValid: Number.isFinite(dailyLimit) && dailyLimit > 0 },
    proofs: { ready: proofReady, mode: modeValid ? mode : 'invalid', signerValid, trustedSignerValid, signerMatchesTrusted, onchainConfigurationPresent: schemasPresent && present('BASE_RPC_URL'), chainAndSchemaVerification: 'not performed' },
    mainDeploymentHeld: hold,
  },
  database: { checked: false },
};

let unavailable = false;
if (args.includes('--database')) {
  if (!databaseUrl || !['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    report.database = { checked: false, error: 'A valid PostgreSQL DATABASE_URL is required.' };
    unavailable = true;
  } else {
    let db;
    try {
      const { PrismaClient, Prisma } = await import('@prisma/client');
      db = new PrismaClient({ log: [] });
      const metadata = await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
        const columns = await tx.$queryRawUnsafe("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'");
        const tables = await tx.$queryRawUnsafe("SELECT c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'");
        // Effective privileges, not role_table_grants: these include access granted through PUBLIC
        // and column-only grants (e.g. GRANT SELECT (key) ON "ApiKey" TO anon).
        const grants = await tx.$queryRawUnsafe("SELECT c.relname AS table_name, r.rolname AS grantee FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN pg_roles r WHERE n.nspname = 'public' AND c.relkind = 'r' AND r.rolname IN ('anon', 'authenticated') AND (has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))");
        const policies = await tx.$queryRawUnsafe("SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public'");
        return { columns, tables, grants, policies };
      }, { timeout: 20_000, maxWait: 5_000 });
      const missingFields = Prisma.dmmf.datamodel.models.map(model => {
        const table = model.dbName || model.name;
        const columns = metadata.columns.filter(column => column.table_name === table);
        return { table, exists: columns.length > 0, missing: model.fields.filter(field => field.kind !== 'object' && !columns.some(column => column.column_name === (field.dbName || field.name))).map(field => field.dbName || field.name) };
      }).filter(table => table.missing.length > 0);
      // These are deliberately server-only tables in 1.1. Legacy app tables have separate ownership policies.
      const serverOnly = ['ApiKey', 'Assignment', 'Protocol', 'InsightsCache', 'HealthImportConnection', 'AiDailyUsage', 'ExperimentAttestation', 'Study', 'StudyMember', 'StudyParticipant', 'StudyConsent'];
      const securityIssues = serverOnly.flatMap(name => {
        const table = metadata.tables.find(table => table.name === name);
        if (!table) return [];
        const failures = [];
        if (!table.rls) failures.push(`${name}: RLS disabled`);
        if (metadata.grants.some(grant => grant.table_name === name)) failures.push(`${name}: browser/PUBLIC grants remain`);
        if (metadata.policies.some(policy => policy.tablename === name)) failures.push(`${name}: unexpected browser policy`);
        return failures;
      });
      report.database = { checked: true, missingFields, securityIssues, ready: missingFields.length === 0 && securityIssues.length === 0, limitations: 'Presence/security metadata only. Use the rollout preflight for types, constraints, grants, migration compatibility and backup/staging gates.' };
    } catch (error) {
      // Driver error text can embed credentials or SQL. Return only a bounded code/name.
      report.database = { checked: false, error: /^[A-Za-z0-9_]{1,60}$/.test(error.code || error.name || '') ? (error.code || error.name) : 'DatabaseAuditFailed' };
      unavailable = true;
    } finally {
      try { await db?.$disconnect(); } catch {
        report.database = { checked: false, error: 'DatabaseDisconnectFailed' };
        unavailable = true;
      }
    }
  }
}

report.readyForIntegratedWebValidation = missing.length === 0 && issues.length === 0 && aiReady && proofReady && report.database.ready === true;
report.releaseAuthorized = false;
report.releaseNote = 'Readiness does not authorize deployment or store submission. Main remains held until the reviewed database/staging rollout is complete; stores require separate owner authorization.';
console.log(JSON.stringify(report, null, 2));
process.exitCode = unavailable ? 2 : report.readyForIntegratedWebValidation ? 0 : 1;
