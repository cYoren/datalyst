import { describe, expect, it } from 'vitest';
import { compareWeeks, daysBetweenInclusive, returnCardFor, returnCardLines, type ReturnCardInput } from './return-card';

/**
 * `ROADMAP.md` W4 acceptance: a fixture per day renders the expected card, and the day-seven line
 * always carries its n and its caution.
 */

const main = { name: 'Headache', unit: '/10', direction: 'LOWER_BETTER' as const };

function week(values: (number | null)[], startDay = 8): { date: string; value: number | null }[] {
    return values.map((value, index) => ({
        date: `2026-11-${String(startDay + index).padStart(2, '0')}`,
        value,
    }));
}

function input(overrides: Partial<ReturnCardInput> = {}): ReturnCardInput {
    return {
        firstLoggedOn: '2026-11-14',
        today: '2026-11-14',
        main,
        mainDays: week([6], 14),
        loggedToday: true,
        answerCount: 2,
        ...overrides,
    };
}

describe('the day-one card', () => {
    it('appears after the first save and offers the reminder', () => {
        const card = returnCardFor(input());
        expect(card).toMatchObject({ kind: 'day-1', offerReminder: true });
        expect(returnCardLines(card!, main).body[0]).toMatch(/tomorrow at the same time/i);
    });

    it('does not appear before anything was logged today', () => {
        expect(returnCardFor(input({ loggedToday: false }))).toBeNull();
        expect(returnCardFor(input({ answerCount: 0 }))).toBeNull();
    });

    it('does not appear on day two', () => {
        expect(returnCardFor(input({ today: '2026-11-15' }))).toBeNull();
    });
});

describe('the day-three card', () => {
    it('puts the three days side by side, and says which was not logged', () => {
        const card = returnCardFor(input({
            today: '2026-11-16',
            mainDays: week([6, null, 4], 14),
        }));
        expect(card?.kind).toBe('day-3');

        const lines = returnCardLines(card!, main);
        expect(lines.body).toHaveLength(3);
        expect(lines.body[1]).toContain('not logged');
        expect(lines.body[0]).toContain('6 /10');
        // No percentage, no trend, no claim: three described days.
        expect(lines.body.join(' ')).not.toMatch(/%|trend|improving|worse/i);
    });

    it('stays away when only one of the three days has a value', () => {
        expect(returnCardFor(input({ today: '2026-11-16', mainDays: week([null, null, 4], 14) }))).toBeNull();
    });
});

describe('the day-seven card', () => {
    it('summarises a week without claiming a pattern', () => {
        const card = returnCardFor(input({
            today: '2026-11-20',
            mainDays: week([6, 4, null, 8, 3, 5, 2], 14),
        }));
        expect(card?.kind).toBe('day-7');
        if (card?.kind !== 'day-7') throw new Error('expected a week card');

        expect(card.average).toBe(4.7);
        expect(card.loggedDays).toBe(6);
        // Lower is better for a headache, so the best day is the lowest value.
        expect(card.best?.value).toBe(2);
        expect(card.worst?.value).toBe(8);

        const lines = returnCardLines(card, main);
        expect(lines.body.join(' ')).toContain('6 logged days');
        expect(lines.body.join(' ')).not.toMatch(/proves|pattern\b(?!s)|significant|correlat/i);
    });

    it('reports the highest and lowest day without guessing direction', () => {
        const neutral = { name: 'Caffeine', unit: 'mg', direction: 'NEUTRAL' as const };
        const card = returnCardFor(input({ today: '2026-11-20', main: neutral, mainDays: week([90, 120, 60, 80, 100, 70, 50], 14) }));
        if (card?.kind !== 'day-7') throw new Error('expected a week card');

        expect(card.best).toBeNull();
        expect(card.worst).toBeNull();
        expect(returnCardLines(card, neutral).body.join(' ')).not.toMatch(/best day|hardest day/i);
    });

    it('carries its n and its caution on the comparison line', () => {
        const card = returnCardFor(input({
            today: '2026-11-20',
            mainDays: week([6, 4, 8, 3, 5, 2, 7], 14),
            other: { name: 'Sleep', unit: 'h' },
            otherDays: week([5, 5, 5, 8, 8, 8, 8], 14),
        }));
        if (card?.kind !== 'day-7') throw new Error('expected a week card');

        expect(card.comparison).toContain('too few to call a pattern');
        expect(card.comparison).toMatch(/On the \d days/);
        expect(card.comparison).toMatch(/\d days logged/);
    });

    it('refuses to compare a week that is too short or has no split', () => {
        const mainLogged = [
            { date: '2026-11-14', value: 6 },
            { date: '2026-11-15', value: 4 },
            { date: '2026-11-16', value: 8 },
        ];
        expect(compareWeeks(main, mainLogged, { name: 'Sleep' }, week([5, 5, 5], 14))).toBeNull();
        expect(compareWeeks(main, mainLogged, { name: 'Sleep' }, week([5, 6, 7], 14))).toBeNull();
    });

    it('requires at least three logged days before saying anything about the week', () => {
        expect(returnCardFor(input({ today: '2026-11-20', mainDays: week([6, null, null, null, null, null, 2], 14) }))).toBeNull();
    });
});

describe('counting the days', () => {
    it('counts the first day as day one', () => {
        expect(daysBetweenInclusive('2026-11-14', '2026-11-14')).toBe(1);
        expect(daysBetweenInclusive('2026-11-14', '2026-11-20')).toBe(7);
    });

    it('takes the day from the caller, so a time zone cannot shift it', async () => {
        const { localDayIn } = await import('@/lib/logical-day');
        // 01:00 UTC on the 15th is still the evening of the 14th in São Paulo. The card must be
        // day one there, not day two (S4 review: a UTC `today` hid day one all evening).
        expect(localDayIn('America/Sao_Paulo', new Date('2026-11-15T01:00:00Z'))).toBe('2026-11-14');
        expect(localDayIn('UTC', new Date('2026-11-15T01:00:00Z'))).toBe('2026-11-15');
        // East of UTC the opposite: 22:00 UTC on the 14th is already the 15th in Sydney.
        expect(localDayIn('Australia/Sydney', new Date('2026-11-14T22:00:00Z'))).toBe('2026-11-15');
    });
});

describe('the reminder offer (W5)', () => {
    it('suggests the hour of the check-in, not a fixed evening', async () => {
        const { clockIn } = await import('@/services/dashboard.service');
        // 14:20 in São Paulo is 17:20 UTC.
        expect(clockIn('America/Sao_Paulo', new Date('2026-11-14T17:20:00Z'))).toBe('14:20');
        expect(clockIn('UTC', new Date('2026-11-14T17:20:00Z'))).toBe('17:20');
        // An unusable zone falls back to UTC instead of throwing.
        expect(clockIn('Mars/Olympus', new Date('2026-11-14T17:20:00Z'))).toBe('17:20');
        expect(clockIn(null, new Date('2026-11-14T17:20:00Z'))).toBe('17:20');
    });
});
