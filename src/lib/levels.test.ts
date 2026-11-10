import {
    atMinuteOfDay,
    buildSeries,
    clearTime,
    clockLabel,
    decayFactor,
    latestDoseTime,
    levelAt,
    minutesOfDay,
    peak,
    presetForTracker,
    windowFor,
    type Dose,
} from '@/lib/levels';

const HOUR = 3_600_000;
const HALF_LIFE = 5;

/** A fixed local reference day keeps the clock assertions timezone-independent. */
const dayStart = new Date(2026, 0, 15, 0, 0, 0, 0).getTime();
const at = (hours: number) => dayStart + hours * HOUR;
const dose = (id: string, hours: number, amount: number, planned = false): Dose => ({
    id,
    at: at(hours),
    amount,
    planned,
});

describe('decayFactor', () => {
    it('is 1 at the moment of the dose', () => {
        expect(decayFactor(0, HALF_LIFE)).toBe(1);
    });

    it('halves every half-life', () => {
        expect(decayFactor(5 * HOUR, HALF_LIFE)).toBeCloseTo(0.5, 6);
        expect(decayFactor(10 * HOUR, HALF_LIFE)).toBeCloseTo(0.25, 6);
    });

    it('is zero before the dose and for a nonsense half-life', () => {
        expect(decayFactor(-HOUR, HALF_LIFE)).toBe(0);
        expect(decayFactor(HOUR, 0)).toBe(0);
    });
});

describe('levelAt', () => {
    it('sums the contribution of every earlier dose', () => {
        const doses = [dose('a', 8, 100), dose('b', 11, 100)];
        // 8 h after the first 100 mg (half-life 5) leaves ~33 mg; the second is midway.
        expect(levelAt(doses, at(16), HALF_LIFE)).toBeCloseTo(32.99 + 50, 1);
    });

    it('ignores doses that land later', () => {
        expect(levelAt([dose('a', 20, 100)], at(10), HALF_LIFE)).toBe(0);
    });
});

describe('buildSeries', () => {
    const series = buildSeries({
        doses: [dose('a', 8, 100), dose('b', 12, 50, true)],
        halfLifeHours: HALF_LIFE,
        start: at(8),
        end: at(10),
        stepMinutes: 30,
    });

    it('keeps logged and planned apart but totals them', () => {
        expect(series).toHaveLength(5);
        const first = series[0];
        expect(first.logged).toBe(100);
        expect(first.planned).toBe(0);
        expect(first.total).toBe(100);
        expect(first.doses).toEqual({ a: 100, b: 0 });
    });

    it('counts a planned dose once it is taken, not before', () => {
        expect(levelAt([dose('b', 12, 50, true)], at(11), HALF_LIFE)).toBe(0);
        expect(levelAt([dose('b', 12, 50, true)], at(13), HALF_LIFE)).toBeCloseTo(43.53, 1);
    });
});

describe('peak', () => {
    it('finds the highest point and its time', () => {
        const series = buildSeries({
            doses: [dose('a', 8, 90), dose('b', 11, 95)],
            halfLifeHours: HALF_LIFE,
            start: at(8),
            end: at(13),
            stepMinutes: 1,
        });
        const high = peak(series);
        expect(high?.t).toBe(at(11));
        expect(high?.value).toBeCloseTo(90 * Math.pow(2, -3 / HALF_LIFE) + 95, 1);
    });

    it('returns null for an empty series', () => {
        expect(peak([])).toBeNull();
    });
});

describe('latestDoseTime', () => {
    it('places a 100 mg dose with a 50 mg floor one half-life before bed', () => {
        const bedtime = at(23);
        expect(latestDoseTime({ halfLifeHours: HALF_LIFE, amount: 100, threshold: 50, bedtime })).toBe(bedtime - 5 * HOUR);
    });

    it('allows the whole day for a dose already under the floor', () => {
        const bedtime = at(23);
        expect(latestDoseTime({ halfLifeHours: HALF_LIFE, amount: 40, threshold: 50, bedtime })).toBe(bedtime);
    });
});

describe('clearTime', () => {
    it('finds when a single dose falls under the floor', () => {
        const clear = clearTime({
            doses: [dose('a', 8, 100)],
            halfLifeHours: HALF_LIFE,
            threshold: 50,
            from: at(8),
        });
        expect(clear).toBe(at(13));
    });

    it('returns the starting moment when already below the floor', () => {
        expect(
            clearTime({ doses: [dose('a', 2, 100)], halfLifeHours: HALF_LIFE, threshold: 50, from: at(14) })
        ).toBe(at(14));
    });

    it('returns null without doses', () => {
        expect(clearTime({ doses: [], halfLifeHours: HALF_LIFE, threshold: 50, from: at(8) })).toBeNull();
    });
});

describe('clock helpers', () => {
    it('formats minutes of day and wraps', () => {
        expect(clockLabel(0)).toBe('00:00');
        expect(clockLabel(23 * 60 + 5)).toBe('23:05');
        expect(clockLabel(25 * 60)).toBe('01:00');
        expect(clockLabel(-60)).toBe('23:00');
    });

    it('round-trips a minute of day', () => {
        const stamp = atMinuteOfDay(new Date(dayStart), 11 * 60 + 15);
        expect(minutesOfDay(new Date(stamp))).toBe(11 * 60 + 15);
    });
});

describe('windowFor', () => {
    it('opens at 04:00 on the same day', () => {
        const day = windowFor(new Date(2026, 0, 15, 15, 0, 0, 0));
        expect(minutesOfDay(new Date(day.start))).toBe(4 * 60);
        expect(day.end - day.start).toBe(24 * HOUR);
    });

    it('still shows yesterday when it is 2am', () => {
        const day = windowFor(new Date(2026, 0, 15, 2, 0, 0, 0));
        expect(new Date(day.start).getDate()).toBe(14);
    });
});

describe('presetForTracker', () => {
    it('picks the substance from the tracker name', () => {
        expect(presetForTracker('Caffeine Intake').key).toBe('caffeine');
        expect(presetForTracker('Evening vape').key).toBe('nicotine');
        expect(presetForTracker('Melatonin').key).toBe('melatonin');
    });

    it('falls back to caffeine', () => {
        expect(presetForTracker('Water').key).toBe('caffeine');
        expect(presetForTracker(null).key).toBe('caffeine');
    });
});
