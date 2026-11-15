import { describe, expect, it } from 'vitest';
import { dashboardPairs, readinessFor, readinessSentence, type PairDays } from './pattern-readiness';
import { MIN_PAIRED_DAYS } from '@/stats/thresholds';

const pair = (first: string, second: string, daysTogether: number): PairDays => ({ first, second, daysTogether });

describe('pattern readiness', () => {
    it('needs the same number of paired days the engine does', () => {
        expect(readinessFor([pair('A', 'B', MIN_PAIRED_DAYS)]).at(0)).toMatchObject({ daysNeeded: 0, ready: true });
        expect(readinessFor([pair('A', 'B', 8)]).at(0)).toMatchObject({ daysNeeded: MIN_PAIRED_DAYS - 8, ready: false });
    });

    it('never counts backwards past ready', () => {
        expect(readinessFor([pair('A', 'B', 40)]).at(0)?.daysNeeded).toBe(0);
    });

    it('names the pairs closest to ready, not the day count in general', () => {
        const closest = dashboardPairs([pair('Sleep', 'Headache', 8), pair('Mood', 'Caffeine', 12), pair('Steps', 'Sleep', 3)]);
        expect(closest.map((p) => `${p.first}/${p.second}:${p.daysNeeded}`)).toEqual([
            'Mood/Caffeine:2',
            'Sleep/Headache:6',
        ]);
    });

    it('leaves out pairs with no shared day', () => {
        expect(dashboardPairs([pair('A', 'B', 0)])).toEqual([]);
    });

    it('does not drop a pair that is already ready while something is still counting', () => {
        const shown = dashboardPairs([pair('A', 'B', MIN_PAIRED_DAYS), pair('C', 'D', 9), pair('E', 'F', MIN_PAIRED_DAYS)]);
        expect(shown.map((p) => p.first)).toEqual(['C']);
    });

    it('says enough days together rather than nothing logged, once every pair is ready', () => {
        // 30 paired days and no pattern yet: the old filter said "you have logged nothing".
        const shown = dashboardPairs([pair('A', 'B', 30), pair('C', 'D', MIN_PAIRED_DAYS)]);
        expect(shown).toHaveLength(2);
        expect(shown.every((p) => p.ready)).toBe(true);
        expect(readinessSentence(shown[0])).toBe('A and B: enough days together, and no clear pattern yet.');
    });

    it('says it in one sentence a person can act on', () => {
        expect(readinessSentence(readinessFor([pair('Sleep (Hours)', 'Headache (Pain)', 8)]).at(0)!)).toBe(
            'Sleep (Hours) and Headache (Pain): 6 more days together.'
        );
        expect(readinessSentence(readinessFor([pair('A', 'B', 13)]).at(0)!)).toBe('A and B: 1 more day together.');
        expect(readinessSentence(readinessFor([pair('A', 'B', 14)]).at(0)!)).toBe(
            'A and B: enough days together, and no clear pattern yet.'
        );
    });
});
