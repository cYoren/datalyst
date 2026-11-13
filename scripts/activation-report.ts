/**
 * Prints the first-use funnel: accounts → tracker → first check-in → repeat days → experiment.
 *
 *   node scripts/activation-report.ts          # Node 23.6+ runs TypeScript directly
 *   npm run activation:report                  # same thing, via the package script
 *
 * Aggregate only. It counts rows in `HabitEntry` (user, day, timestamp); no health value, no
 * symptom name and no note is selected, so nothing sensitive can reach a terminal or a pasted
 * log. The query lives in `src/lib/activation-funnel.ts` so the report has one definition.
 *
 * Connection: `DATABASE_URL`, or `HYPERDRIVE_URL` for the production database (the app reaches
 * it through a Cloudflare Hyperdrive binding, which a script cannot read). Both go through the
 * same `@prisma/adapter-pg` driver the app uses, so the report cannot disagree with the app
 * about what the columns mean.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'path';

import {
    ACTIVATION_FUNNEL_QUERY,
    formatActivationFunnel,
    toActivationFunnel,
    type ActivationFunnelRow,
} from '../src/lib/activation-funnel.ts';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function connectionString(): string {
    const url = process.env.DATABASE_URL?.trim() || process.env.HYPERDRIVE_URL?.trim();
    if (!url) {
        throw new Error(
            'No database to report on. Set DATABASE_URL, or HYPERDRIVE_URL for the production ' +
            'database (the app reaches it through a Cloudflare Hyperdrive binding, which a ' +
            'script cannot read).',
        );
    }
    return url;
}

async function main() {
    // Built inside main so a connection failure is reported by the handler below rather than
    // thrown at module scope, where nothing catches it.
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString() }) });
    try {
        const rows = await prisma.$queryRaw<ActivationFunnelRow[]>(ACTIVATION_FUNNEL_QUERY);
        for (const line of formatActivationFunnel(toActivationFunnel(rows))) console.log(line);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    // The message only: a Prisma error can carry the failing SQL.
    console.error('Activation report failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
});
