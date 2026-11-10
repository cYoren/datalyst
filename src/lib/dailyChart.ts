/**
 * Daily chart rows.
 *
 * The Data page draws one point per entry, which is right for a reading you take
 * once a day. A dose tracker logs several entries a day on purpose, so its day is
 * the sum of its entries, not the last one. This turns a habit's entries into rows
 * for the chart: `sum` variables add up, everything else keeps its last reading.
 */

import type { SubvariableMetadata } from '@/types';

export interface DailyRowSubvariable {
    id: string;
    name: string;
    type: string;
    metadata?: SubvariableMetadata | null;
}

export interface DailyRowEntry {
    logicalDate: string;
    subvariableEntries: Array<{ subvariableId: string; numericValue: number; rawValue?: string }>;
}

export interface DailyRow {
    date: string;
    fullDate: string;
    [key: string]: string | number | null;
}

/** True when the variable counts events that add up within a day (a dose, a glass). */
export function isSummedVariable(subvariable: Pick<DailyRowSubvariable, 'metadata'>): boolean {
    return subvariable.metadata?.aggregation === 'sum';
}

function dayKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * One row per calendar day, oldest first.
 * `sum` variables: the total of the day's entries. Others: the last value seen.
 */
export function buildDailyRows(
    entries: DailyRowEntry[],
    subvariables: DailyRowSubvariable[]
): DailyRow[] {
    const days = new Map<string, { at: number; values: Record<string, number>; raw: Record<string, string | null> }>();

    for (const entry of entries) {
        const when = new Date(entry.logicalDate);
        if (Number.isNaN(when.getTime())) continue;
        const key = dayKey(when);
        const bucket = days.get(key) ?? { at: when.getTime(), values: {}, raw: {} };
        if (when.getTime() < bucket.at) bucket.at = when.getTime();

        for (const value of entry.subvariableEntries) {
            const definition = subvariables.find((subvariable) => subvariable.id === value.subvariableId);
            if (!definition) continue;
            if (isSummedVariable(definition)) {
                bucket.values[definition.name] = (bucket.values[definition.name] ?? 0) + value.numericValue;
            } else {
                bucket.values[definition.name] = value.numericValue;
                bucket.raw[definition.name] = value.rawValue ?? null;
            }
        }

        days.set(key, bucket);
    }

    return Array.from(days.entries())
        .sort(([, a], [, b]) => a.at - b.at)
        .map(([key, bucket]) => {
            const [, month, day] = key.split('-');
            const row: DailyRow = {
                date: `${month}/${day}`,
                fullDate: `${MONTHS[Number(month) - 1]} ${day}`,
            };
            for (const subvariable of subvariables) {
                const value = bucket.values[subvariable.name];
                if (value === undefined) continue;
                row[subvariable.name] = subvariable.type === 'CATEGORY'
                    ? bucket.raw[subvariable.name] ?? String(value)
                    : value;
            }
            return row;
        });
}
