import { prisma } from '@/lib/prisma';
import { calculatePearsonCorrelation, calculateSpearmanCorrelation } from '@/stats/correlations';
import { InsightGenerator } from '@/stats/insights';
import { SubvariableType } from '@prisma/client';

export class StatsService {
    /**
     * Calculates correlations between all subvariables for a user
     * This is a heavy operation, should be cached or run in background
     */
    static async calculateGlobalCorrelations(userId: string) {
        // 1. Fetch all data
        const entries = await prisma.habitEntry.findMany({
            where: { userId },
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

        if (entries.length < 14) return []; // Need at least 14 data points for meaningful correlations

        // 2. Pivot data: Date -> { subvarId: value }
        const dataByDate: Record<string, Record<string, number>> = {};
        const subvarInfo: Record<string, { name: string, habitName: string, type: SubvariableType }> = {};
        const subvarIds = new Set<string>();

        entries.forEach(entry => {
            const dateKey = entry.logicalDate.toISOString().split('T')[0];
            if (!dataByDate[dateKey]) dataByDate[dateKey] = {};

            entry.subvariableEntries.forEach(sub => {
                dataByDate[dateKey][sub.subvariableId] = sub.numericValue;
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

        const uniqueSubvars = Array.from(subvarIds);
        const results = [];

        // 3. Calculate correlations for every pair (with Bonferroni correction)
        const numTests = (uniqueSubvars.length * (uniqueSubvars.length - 1)) / 2;
        const adjustedAlpha = numTests > 0 ? 0.05 / numTests : 0.05;

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

                if (x.length < 14) continue; // Need minimum 14 overlapping data points

                // Choose method based on types
                // If both are numeric continuous -> Pearson
                // If any is ordinal/scale -> Spearman
                const type1 = subvarInfo[id1].type;
                const type2 = subvarInfo[id2].type;

                const isOrdinal = type1 === 'SCALE_0_10' || type2 === 'SCALE_0_10';

                const correlation = isOrdinal
                    ? calculateSpearmanCorrelation(x, y)
                    : calculatePearsonCorrelation(x, y);

                if (correlation && correlation.pValue < adjustedAlpha && Math.abs(correlation.coefficient) > 0.3) {
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
