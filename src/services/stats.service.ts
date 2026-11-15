import { prisma } from '@/lib/prisma';
import { calculatePearsonCorrelation, calculateSpearmanCorrelation } from '@/stats/correlations';
import { InsightGenerator } from '@/stats/insights';
import { MIN_ABS_COEFFICIENT, MIN_PAIRED_DAYS, SIGNIFICANCE_ALPHA } from '@/stats/thresholds';
import { dashboardPairs, type PairDays } from '@/lib/pattern-readiness';
import type { SubvariableType } from '@prisma/client';

type SubvariableInfo = { name: string; habitName: string; type: SubvariableType };

interface Pivot {
    dataByDate: Record<string, Record<string, number>>;
    subvarInfo: Record<string, SubvariableInfo>;
    uniqueSubvars: string[];
}

/** A subvariable's stored metadata, or an empty object when it is legacy or malformed. */
function parseMetadata(raw: string | null | undefined): { aggregation?: 'sum' } {
    try {
        return JSON.parse(raw || '{}');
    } catch {
        return {};
    }
}

/** How far back the dashboard's statistics read. */
export const PIVOT_WINDOW_DAYS = 365;

export class StatsService {
    /**
     * Every entry a person has, pivoted to date -> variable -> value. Both the
     * correlation engine and the readiness counter read the same shape, so the
     * "6 more days together" line cannot drift from the rule that decides when a
     * pattern appears.
     */
    private static async loadPivot(userId: string): Promise<Pivot> {
        // A year of entries is enough for every rule here (14 paired days, and correlations that
        // a person can act on). Reading the whole history on every dashboard open made the first
        // paint scale with account age, which is why the pivot is now bounded.
        const since = new Date(Date.now() - PIVOT_WINDOW_DAYS * 86_400_000);
        const entries = await prisma.habitEntry.findMany({
            where: { userId, logicalDate: { gte: since } },
            include: {
                subvariableEntries: {
                    include: {
                        subvariable: {
                            include: { habit: true }
                        }
                    }
                }
            },
            orderBy: { logicalDate: 'asc' }
        });

        const dataByDate: Pivot['dataByDate'] = {};
        const subvarInfo: Pivot['subvarInfo'] = {};
        const subvarIds = new Set<string>();

        entries.forEach(entry => {
            const dateKey = entry.logicalDate.toISOString().split('T')[0];
            if (!dataByDate[dateKey]) dataByDate[dateKey] = {};

            entry.subvariableEntries.forEach(sub => {
                // A dose tracker logs one entry per cup; the day's value is their sum, which is
                // what the chart shows and what the statistics must agree with. Last-wins made a
                // three-coffee day read as the last cup's mg.
                const metadata = parseMetadata(sub.subvariable.metadata);
                const previous = dataByDate[dateKey][sub.subvariableId];
                dataByDate[dateKey][sub.subvariableId] = metadata.aggregation === 'sum' && previous !== undefined
                    ? previous + sub.numericValue
                    : sub.numericValue;
                subvarIds.add(sub.subvariableId);

                if (!subvarInfo[sub.subvariableId]) {
                    subvarInfo[sub.subvariableId] = {
                        name: sub.subvariable.name,
                        habitName: sub.subvariable.habit.name,
                        type: sub.subvariable.type
                    };
                }
            });
        });

        return { dataByDate, subvarInfo, uniqueSubvars: Array.from(subvarIds) };
    }

    /** Paired-day counts for every pair, named the way a person reads them. */
    static async pairDayCounts(userId: string): Promise<PairDays[]> {
        const { dataByDate, subvarInfo, uniqueSubvars } = await this.loadPivot(userId);
        const days = Object.values(dataByDate);
        const pairs: PairDays[] = [];

        for (let i = 0; i < uniqueSubvars.length; i++) {
            for (let j = i + 1; j < uniqueSubvars.length; j++) {
                const id1 = uniqueSubvars[i];
                const id2 = uniqueSubvars[j];
                let daysTogether = 0;
                for (const day of days) {
                    if (day[id1] !== undefined && day[id2] !== undefined) daysTogether += 1;
                }
                if (daysTogether === 0) continue;
                const info1 = subvarInfo[id1];
                const info2 = subvarInfo[id2];
                pairs.push({
                    first: `${info1.habitName} (${info1.name})`,
                    second: `${info2.habitName} (${info2.name})`,
                    daysTogether
                });
            }
        }

        return pairs;
    }

    /** The pairs closest to enough paired days, for the dashboard line. */
    static async getReadiness(userId: string, limit = 2) {
        return dashboardPairs(await this.pairDayCounts(userId), limit);
    }

    /**
     * Calculates correlations between all subvariables for a user
     * This is a heavy operation, should be cached or run in background
     */
    static async calculateGlobalCorrelations(userId: string) {
        const { dataByDate, subvarInfo, uniqueSubvars } = await this.loadPivot(userId);

        if (Object.keys(dataByDate).length < MIN_PAIRED_DAYS) return [];

        const results = [];

        // Calculate correlations for every pair (with Bonferroni correction)
        const numTests = (uniqueSubvars.length * (uniqueSubvars.length - 1)) / 2;
        const adjustedAlpha = numTests > 0 ? SIGNIFICANCE_ALPHA / numTests : SIGNIFICANCE_ALPHA;

        for (let i = 0; i < uniqueSubvars.length; i++) {
            for (let j = i + 1; j < uniqueSubvars.length; j++) {
                const id1 = uniqueSubvars[i];
                const id2 = uniqueSubvars[j];

                // Extract paired arrays
                const x: number[] = [];
                const y: number[] = [];

                Object.values(dataByDate).forEach(dayData => {
                    if (dayData[id1] !== undefined && dayData[id2] !== undefined) {
                        x.push(dayData[id1]);
                        y.push(dayData[id2]);
                    }
                });

                if (x.length < MIN_PAIRED_DAYS) continue;

                // Choose method based on types
                // If both are numeric continuous -> Pearson
                // If any is ordinal/scale -> Spearman
                const type1 = subvarInfo[id1].type;
                const type2 = subvarInfo[id2].type;

                const isOrdinal = type1 === 'SCALE_0_10' || type2 === 'SCALE_0_10';

                const correlation = isOrdinal
                    ? calculateSpearmanCorrelation(x, y)
                    : calculatePearsonCorrelation(x, y);

                if (correlation && correlation.pValue < adjustedAlpha && Math.abs(correlation.coefficient) > MIN_ABS_COEFFICIENT) {
                    const info1 = subvarInfo[id1];
                    const info2 = subvarInfo[id2];

                    // A boolean outcome and a numeric value from the same tracker are
                    // often mechanically linked, not an independent discovery. For
                    // example, workout intensity is usually zero when "Did Workout?"
                    // is false. Keep these out of global insights to avoid tautologies.
                    const sameTracker = info1.habitName === info2.habitName;
                    const oneBoolean = type1 === 'BOOLEAN' || type2 === 'BOOLEAN';
                    if (sameTracker && oneBoolean) continue;

                    results.push({
                        variable1: { id: id1, name: info1.name, habit: info1.habitName },
                        variable2: { id: id2, name: info2.name, habit: info2.habitName },
                        ...correlation,
                        text: InsightGenerator.interpretCorrelation(
                            `${info1.habitName} (${info1.name})`,
                            `${info2.habitName} (${info2.name})`,
                            correlation
                        )
                    });
                }
            }
        }

        // Sort by strength
        return results.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
    }
}
