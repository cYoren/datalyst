import { describe, it, expect } from 'vitest';
import { isWidgetDayAllowed, nextCheckIn, userDayKey } from './widget-next';

const variable = (over: Record<string, unknown> = {}) => ({
    id: 's1', name: 'Sleep', type: 'BOOLEAN', habitId: 'h1', todayEntry: null, ...over,
});

describe('nextCheckIn', () => {
    it('names the first variable still missing today', () => {
        expect(nextCheckIn([variable({ todayEntry: { entryId: 'e' } }), variable({ id: 's2', name: 'Mood' })]))
            .toEqual({ name: 'Mood', subvariableId: 's2', habitId: 'h1', canLog: true });
    });

    it('only offers one-tap logging for yes/no variables', () => {
        expect(nextCheckIn([variable()])?.canLog).toBe(true);
        expect(nextCheckIn([variable({ type: 'NUMERIC' })])?.canLog).toBe(false);
    });

    it('skips experiment-controlled variables and malformed rows', () => {
        expect(nextCheckIn([variable({ isExperimentIndependent: true })])).toBeNull();
        expect(nextCheckIn([{ id: 's1' }, null, 'nope'])).toBeNull();
    });

    it('returns null when the day is complete', () => {
        expect(nextCheckIn([])).toBeNull();
    });
});

describe('isWidgetDayAllowed', () => {
    // 01:00 UTC on the 13th is still the 12th in Sao Paulo (UTC-3).
    const now = new Date('2026-11-13T01:00:00Z');

    it("takes the user's own day, not the server's", () => {
        expect(userDayKey(now, 'America/Sao_Paulo')).toBe('2026-11-12');
        expect(isWidgetDayAllowed('2026-11-12', 'America/Sao_Paulo', now)).toBe(true);
    });

    it("still accepts the server's UTC day, so a wrong timezone cannot lock a user out", () => {
        // The stored timezone defaults to UTC and can be stale; the check-in is on screen,
        // so the day the server itself is on must remain writable.
        expect(isWidgetDayAllowed('2026-11-13', 'America/Sao_Paulo', now)).toBe(true);
    });

    it('refuses a stale widget and a backfilled history', () => {
        // Yesterday in the user's own timezone is the stale case: the pill is hidden on both
        // platforms, so a write for it is a bug or a leaked key.
        expect(isWidgetDayAllowed('2026-11-11', 'America/Sao_Paulo', now)).toBe(false);
        expect(isWidgetDayAllowed('2026-11-14', 'America/Sao_Paulo', now)).toBe(false);
        expect(isWidgetDayAllowed('2026-10-13', 'America/Sao_Paulo', now)).toBe(false);
        expect(isWidgetDayAllowed('2027-11-12', 'America/Sao_Paulo', now)).toBe(false);
    });

    it('falls back to the UTC day when the timezone is unknown', () => {
        expect(userDayKey(now, 'Mars/Olympus')).toBe('2026-11-13');
        expect(isWidgetDayAllowed('2026-11-13', 'Mars/Olympus', now)).toBe(true);
    });

    it('refuses a date it cannot read', () => {
        expect(isWidgetDayAllowed('not-a-date', 'UTC', now)).toBe(false);
        expect(isWidgetDayAllowed('13/11/2026', 'UTC', now)).toBe(false);
    });
});
