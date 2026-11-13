import { Prisma } from '@prisma/client';

/**
 * The first-use funnel, derived from data the product already stores.
 *
 * The revenue audit's last finding was that nothing measures activation, so no change to the
 * first-use path can be judged. It does not need a new event table: `HabitEntry` already
 * carries the user, the day and the timestamp, which is the whole funnel. Deriving it means no
 * migration, no new write on the hot check-in path, and no way for the two to disagree.
 *
 * Aggregate only. No health value, no symptom name, no note and no per-user row: the smallest
 * cell here is "how many users", never "what did this one log".
 *
 * Kept free of `server-only` and of a Prisma client so the report script and the service can
 * share one definition of the query.
 */

export interface ActivationFunnel {
    /** Accounts that exist. */
    totalUsers: number;
    /** Accounts that created at least one tracker. */
    usersWithTracker: number;
    /** Accounts with at least one saved check-in. This is the activation event. */
    usersWithCheckIn: number;
    /** Accounts that logged on two or more distinct days. */
    usersWithSecondDay: number;
    /** Accounts that logged on seven or more distinct days. */
    usersWithSevenDays: number;
    /** Accounts that created at least one experiment. */
    usersWithExperiment: number;
    /** Median hours from signup to the first saved check-in, or null when nobody has logged. */
    medianHoursToFirstCheckIn: number | null;
}

export interface ActivationFunnelRow {
    totalUsers: bigint | number | string;
    usersWithTracker: bigint | number | string;
    usersWithCheckIn: bigint | number | string;
    usersWithSecondDay: bigint | number | string;
    usersWithSevenDays: bigint | number | string;
    usersWithExperiment: bigint | number | string;
    medianHoursToFirstCheckIn: number | string | null;
}

/**
 * One round trip. `logicalDate` is a timestamp, and not every write path rounds it to midnight
 * (`entry.service.ts` and `import.service.ts` both keep whatever time they were given), so the
 * DISTINCT is taken on `::date`: a logging day is a calendar day, which is what D1/D7 means
 * here. `archived = false` matches what the dashboard counts as a live tracker.
 *
 * This is a report, not a strict funnel: `usersWithTracker` counts live trackers, so archiving
 * or deleting one can leave more users with a check-in than with a tracker. The nested steps
 * (check-in ⊇ 2 days ⊇ 7 days) do hold; the others are context.
 */
export const ACTIVATION_FUNNEL_QUERY = Prisma.sql`
    WITH days AS (
        SELECT "userId", COUNT(DISTINCT "logicalDate"::date) AS "loggedDays"
        FROM "HabitEntry"
        GROUP BY "userId"
    ),
    firsts AS (
        SELECT "userId", MIN("timestamp") AS "firstEntryAt"
        FROM "HabitEntry"
        GROUP BY "userId"
    )
    SELECT
        (SELECT COUNT(*) FROM "User") AS "totalUsers",
        (SELECT COUNT(DISTINCT "userId") FROM "Habit" WHERE "archived" = false) AS "usersWithTracker",
        (SELECT COUNT(*) FROM days) AS "usersWithCheckIn",
        (SELECT COUNT(*) FROM days WHERE "loggedDays" >= 2) AS "usersWithSecondDay",
        (SELECT COUNT(*) FROM days WHERE "loggedDays" >= 7) AS "usersWithSevenDays",
        (SELECT COUNT(DISTINCT "userId") FROM "Experiment") AS "usersWithExperiment",
        (
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
                -- GREATEST: an imported or backdated first entry can predate the account.
                ORDER BY GREATEST(EXTRACT(EPOCH FROM (firsts."firstEntryAt" - u."createdAt")) / 3600.0, 0)
            )
            FROM firsts
            JOIN "User" u ON u."id" = firsts."userId"
        ) AS "medianHoursToFirstCheckIn"
`;

/**
 * Postgres returns bigint for COUNT, and node-postgres can hand back a numeric string depending
 * on the adapter, so both are read. Anything else is a bug in the query, not a zero.
 */
function count(value: bigint | number | string | null | undefined): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function round(value: number | string | null): number | null {
    if (value === null) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
}

const EMPTY: ActivationFunnel = {
    totalUsers: 0,
    usersWithTracker: 0,
    usersWithCheckIn: 0,
    usersWithSecondDay: 0,
    usersWithSevenDays: 0,
    usersWithExperiment: 0,
    medianHoursToFirstCheckIn: null,
};

export function toActivationFunnel(rows: ActivationFunnelRow[]): ActivationFunnel {
    const row = rows[0];
    if (!row) return { ...EMPTY };
    return {
        totalUsers: count(row.totalUsers),
        usersWithTracker: count(row.usersWithTracker),
        usersWithCheckIn: count(row.usersWithCheckIn),
        usersWithSecondDay: count(row.usersWithSecondDay),
        usersWithSevenDays: count(row.usersWithSevenDays),
        usersWithExperiment: count(row.usersWithExperiment),
        medianHoursToFirstCheckIn: round(row.medianHoursToFirstCheckIn),
    };
}

/** The funnel as one line per step, for a script or a log. */
export function formatActivationFunnel(funnel: ActivationFunnel): string[] {
    const share = (n: number) =>
        funnel.totalUsers > 0 ? ` (${Math.round((n / funnel.totalUsers) * 100)}%)` : '';
    return [
        `accounts              ${funnel.totalUsers}`,
        `created a tracker     ${funnel.usersWithTracker}${share(funnel.usersWithTracker)}`,
        `saved a check-in      ${funnel.usersWithCheckIn}${share(funnel.usersWithCheckIn)}`,
        `logged on 2+ days     ${funnel.usersWithSecondDay}${share(funnel.usersWithSecondDay)}`,
        `logged on 7+ days     ${funnel.usersWithSevenDays}${share(funnel.usersWithSevenDays)}`,
        `created an experiment ${funnel.usersWithExperiment}${share(funnel.usersWithExperiment)}`,
        `median hours to first ${funnel.medianHoursToFirstCheckIn ?? 'n/a'}`,
    ];
}
