import { describe, it, expect } from 'vitest';
import {
    ACTIVATION_FUNNEL_QUERY,
    formatActivationFunnel,
    toActivationFunnel,
} from './activation-funnel';

// Postgres returns bigint for COUNT, and the project targets below ES2020, so these are built
// with BigInt() rather than 100n.
const big = (value: number) => BigInt(value);

const row = (over: Partial<Record<string, unknown>> = {}) => ({
    totalUsers: big(100),
    usersWithTracker: big(60),
    usersWithCheckIn: big(40),
    usersWithSecondDay: big(20),
    usersWithSevenDays: big(8),
    usersWithExperiment: big(3),
    medianHoursToFirstCheckIn: '5.24',
    ...over,
});

/** The query text, or a failure: a silent `[object Object]` would make the checks below vacuous. */
function sql(): string {
    const text = String((ACTIVATION_FUNNEL_QUERY as unknown as { sql?: string }).sql ?? ACTIVATION_FUNNEL_QUERY);
    expect(text, 'could not read the query text from Prisma.sql').toContain('SELECT');
    return text;
}

describe('the query', () => {
    it('returns exactly the seven aggregate columns, and nothing else', () => {
        // Positive assertion: the output aliases are the whole contract. A future edit that
        // starts selecting a column fails here, whatever it is called.
        const aliases = [...sql().matchAll(/AS "(\w+)"/g)].map((match) => match[1]);
        expect(new Set(aliases)).toEqual(new Set([
            // CTE outputs
            'loggedDays',
            'firstEntryAt',
            // the funnel itself
            'totalUsers',
            'usersWithTracker',
            'usersWithCheckIn',
            'usersWithSecondDay',
            'usersWithSevenDays',
            'usersWithExperiment',
            'medianHoursToFirstCheckIn',
        ]));
    });

    it('selects no column from an entry: every value is a count or a percentile', () => {
        const text = sql();
        for (const forbidden of ['"note"', '"rawValue"', '"numericValue"', '"name"', '"email"', '"description"']) {
            expect(text).not.toContain(forbidden);
        }
        // Seven counts, one percentile, and no bare column in the outer select.
        expect([...text.matchAll(/COUNT\(/g)]).toHaveLength(7);
        expect(text).toContain('PERCENTILE_CONT');
    });

    it('counts calendar days, not timestamps', () => {
        // `logicalDate` is a timestamp and not every write path rounds it to midnight, so a
        // plain DISTINCT would count two entries on one day as two logging days.
        expect(sql()).toContain('COUNT(DISTINCT "logicalDate"::date)');
    });

    it('cannot report a negative time to first check-in', () => {
        // An imported or backdated first entry can predate the account.
        expect(sql()).toContain('GREATEST(');
    });
});

describe('toActivationFunnel', () => {
    it('turns Postgres bigints and a numeric median into numbers', () => {
        expect(toActivationFunnel([row()] as never)).toEqual({
            totalUsers: 100,
            usersWithTracker: 60,
            usersWithCheckIn: 40,
            usersWithSecondDay: 20,
            usersWithSevenDays: 8,
            usersWithExperiment: 3,
            medianHoursToFirstCheckIn: 5.2,
        });
    });

    it('reads the counts as strings too, which node-postgres can return', () => {
        const funnel = toActivationFunnel([row({
            totalUsers: '100', usersWithCheckIn: '40', medianHoursToFirstCheckIn: '5.24',
        })] as never);
        expect(funnel.totalUsers).toBe(100);
        expect(funnel.usersWithCheckIn).toBe(40);
        expect(funnel.medianHoursToFirstCheckIn).toBe(5.2);
    });

    it('returns an empty funnel rather than throwing when the database has no rows', () => {
        expect(toActivationFunnel([])).toEqual({
            totalUsers: 0,
            usersWithTracker: 0,
            usersWithCheckIn: 0,
            usersWithSecondDay: 0,
            usersWithSevenDays: 0,
            usersWithExperiment: 0,
            medianHoursToFirstCheckIn: null,
        });
    });

    it('treats a null median as unknown, not as zero', () => {
        expect(toActivationFunnel([row({ medianHoursToFirstCheckIn: null })] as never).medianHoursToFirstCheckIn)
            .toBeNull();
    });

    it('returns exactly the funnel keys, so no per-user field can ride along', () => {
        // The shaping is the boundary: whatever the query grows into, this object is all that
        // leaves the module.
        expect(Object.keys(toActivationFunnel([row()] as never)).sort()).toEqual([
            'medianHoursToFirstCheckIn',
            'totalUsers',
            'usersWithCheckIn',
            'usersWithExperiment',
            'usersWithSecondDay',
            'usersWithSevenDays',
            'usersWithTracker',
        ]);
    });
});

describe('formatActivationFunnel', () => {
    it('prints shares against the account count', () => {
        const lines = formatActivationFunnel(toActivationFunnel([row()] as never));
        expect(lines[0]).toContain('100');
        expect(lines[2]).toContain('40 (40%)');
    });

    it('prints no share when there are no accounts yet', () => {
        const text = formatActivationFunnel(toActivationFunnel([])).join('\n');
        expect(text).not.toContain('%');
        expect(text).toContain('n/a');
    });

    it('prints seven lines and nothing that looks like a row of data', () => {
        const lines = formatActivationFunnel(toActivationFunnel([row()] as never));
        expect(lines).toHaveLength(7);
        for (const line of lines) expect(line).not.toMatch(/@|\busr_|\buser-/);
    });
});
