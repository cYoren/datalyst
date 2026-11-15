/**
 * Something back on days one, three and seven (`ROADMAP.md` W4).
 *
 * Deterministic copy, no AI, and **no statistics claimed**. Each card describes what the person
 * logged and how many days it covers; the day-seven line always carries its n and its caution,
 * because a descriptive difference over seven days is not a pattern.
 *
 * Pure functions over plain data, so the fixtures in the test are the whole contract.
 */

export type GoalDirection = 'HIGHER_BETTER' | 'LOWER_BETTER' | 'NEUTRAL';

export interface DayValue {
    /** `YYYY-MM-DD`. */
    date: string;
    value: number | null;
}

export interface Tracker {
    /** The person's words, e.g. "Headache". */
    name: string;
    unit?: string | null;
    direction?: GoalDirection;
}

export interface ReturnCardInput {
    /** The first day the person ever logged anything, `YYYY-MM-DD`, or null for a new account. */
    firstLoggedOn: string | null;
    /** Today, `YYYY-MM-DD`. */
    today: string;
    /** The tracker the cards talk about: the one with the most complete week. */
    main: Tracker | null;
    /** Up to the last seven days for `main`, oldest first. Missing days are `null`. */
    mainDays: DayValue[];
    /** A second tracker that was logged on enough of the same days to compare against. */
    other?: Tracker | null;
    otherDays?: DayValue[];
    /** True when the person logged something today (day one only makes sense after a save). */
    loggedToday: boolean;
    /** How many answers a check-in has, so day one can invite the next one honestly. */
    answerCount: number;
}

export type ReturnCard =
    | { kind: 'day-1'; headline: string; detail: string; offerReminder: true }
    | { kind: 'day-3'; headline: string; days: { date: string; value: number | null }[] }
    | {
          kind: 'day-7';
          headline: string;
          best: { date: string; value: number } | null;
          worst: { date: string; value: number } | null;
          average: number | null;
          loggedDays: number;
          comparison: string | null;
      };

/** Days from `from` to `to`, inclusive, in UTC. */
export function daysBetweenInclusive(from: string, to: string): number {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) return 0;
    return Math.floor((end - start) / 86_400_000) + 1;
}

function round(value: number): number {
    return Math.round(value * 10) / 10;
}

function formatValue(value: number, unit?: string | null): string {
    const shown = Number.isInteger(value) ? String(value) : round(value).toFixed(1);
    return unit ? `${shown} ${unit}` : shown;
}

function formatDay(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    return parsed.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

/**
 * The card for today, or null when there is nothing to show.
 *
 * It appears on days 1, 3 and 7 counted from the first logged day, and never twice for the same
 * day because the card is a function of the date.
 */
export function returnCardFor(input: ReturnCardInput): ReturnCard | null {
    const { firstLoggedOn, today, main, mainDays, loggedToday } = input;
    if (!firstLoggedOn || !main) return null;

    const dayNumber = daysBetweenInclusive(firstLoggedOn, today);
    if (dayNumber < 1) return null;

    if (dayNumber === 1) {
        if (!loggedToday || input.answerCount === 0) return null;
        return {
            kind: 'day-1',
            headline: 'Logged.',
            detail: 'Tomorrow at the same time? A reminder makes the second day the easy one.',
            offerReminder: true,
        };
    }

    if (dayNumber === 3) {
        const days = mainDays.slice(-3).map((day) => ({ date: day.date, value: day.value }));
        const logged = days.filter((day) => day.value !== null).length;
        // Nothing to put side by side if only today was logged.
        if (logged < 2) return null;
        return { kind: 'day-3', headline: `Three days of ${main.name}`, days };
    }

    if (dayNumber === 7) {
        const week = mainDays.slice(-7);
        const logged = week.filter((day): day is { date: string; value: number } => day.value !== null);
        if (logged.length < 3) return null;

        const average = logged.reduce((sum, day) => sum + day.value, 0) / logged.length;
        const lowest = logged.reduce((min, day) => (day.value < min.value ? day : min), logged[0]);
        const highest = logged.reduce((max, day) => (day.value > max.value ? day : max), logged[0]);

        // "Best" only means something when the tracker has a direction; otherwise report the two
        // ends factually. A card that guesses which direction is better is a card that misleads.
        const direction = main.direction ?? 'NEUTRAL';
        const best = direction === 'LOWER_BETTER' ? lowest : direction === 'HIGHER_BETTER' ? highest : null;
        const worst = direction === 'LOWER_BETTER' ? highest : direction === 'HIGHER_BETTER' ? lowest : null;

        return {
            kind: 'day-7',
            headline: `Your week of ${main.name}`,
            best: best ? { date: best.date, value: best.value } : null,
            worst: worst ? { date: worst.date, value: worst.value } : null,
            average: round(average),
            loggedDays: logged.length,
            comparison: input.other && input.otherDays ? compareWeeks(main, logged, input.other, input.otherDays) : null,
        };
    }

    return null;
}

/**
 * One descriptive line, never a claim: a split of the week by the other tracker's median, with
 * both halves' counts and the caution the roadmap requires.
 */
export function compareWeeks(
    main: Tracker,
    mainLogged: { date: string; value: number }[],
    other: Tracker,
    otherDays: DayValue[],
): string | null {
    const byDate = new Map(otherDays.map((day) => [day.date, day.value] as const));
    const paired = mainLogged
        .map((day) => ({ date: day.date, value: day.value, other: byDate.get(day.date) ?? null }))
        .filter((day): day is { date: string; value: number; other: number } => day.other !== null);

    if (paired.length < 4) return null;

    const sorted = [...paired].map((day) => day.other).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
    if (median === sorted[0]) return null; // Every day the same: no split to make.

    // Split at the median. Ties would otherwise all land on one side (a week of two values is
    // normal), so the boundary moves until both halves have days in them.
    let low = paired.filter((day) => day.other <= median);
    let high = paired.filter((day) => day.other > median);
    if (low.length < 2 || high.length < 2) {
        low = paired.filter((day) => day.other < median);
        high = paired.filter((day) => day.other >= median);
    }
    if (low.length < 2 || high.length < 2) return null;

    const mean = (days: { value: number }[]) => round(days.reduce((sum, day) => sum + day.value, 0) / days.length);
    const lower = mean(low);
    const higher = mean(high);
    if (lower === higher) return null;

    const lowMax = Math.max(...low.map((day) => day.other));
    const lowLabel = `${other.name} up to ${formatValue(lowMax, other.unit)}`;
    const highLabel = `${other.name} over ${formatValue(lowMax, other.unit)}`;

    return `On the ${low.length} days with ${lowLabel}, ${main.name.toLowerCase()} averaged ${formatValue(lower, main.unit)}; `
        + `on the ${high.length} days with ${highLabel}, it averaged ${formatValue(higher, main.unit)} `
        + `(${paired.length} days logged, too few to call a pattern).`;
}

/** The card as the two lines a screen renders, so copy lives in one place. */
export function returnCardLines(card: ReturnCard, main: Tracker | null): { title: string; body: string[] } {
    switch (card.kind) {
        case 'day-1':
            return { title: card.headline, body: [card.detail] };
        case 'day-3':
            return {
                title: card.headline,
                body: card.days.map((day) => `${formatDay(day.date)}: ${day.value === null ? 'not logged' : formatValue(day.value, main?.unit)}`),
            };
        case 'day-7': {
            const body: string[] = [];
            if (card.best) body.push(`Best day: ${formatDay(card.best.date)} (${formatValue(card.best.value, main?.unit)}).`);
            if (card.worst) body.push(`Hardest day: ${formatDay(card.worst.date)} (${formatValue(card.worst.value, main?.unit)}).`);
            body.push(`Average ${formatValue(card.average ?? 0, main?.unit)} across ${card.loggedDays} logged days.`);
            if (card.comparison) body.push(card.comparison);
            return { title: card.headline, body };
        }
    }
}
