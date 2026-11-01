import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { subDays } from 'date-fns';

/**
 * GET /api/correlations
 * Calculate correlation matrix for all user's variables
 * Uses last 30 days of data
 */
export async function GET() {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get date range (last 30 days)
        const endDate = new Date();
        const startDate = subDays(endDate, 30);

        // Fetch all active habits with their primary subvariable
        const habits = await prisma.habit.findMany({
            where: {
                userId: user.id,
                archived: false,
            },
            select: {
                id: true,
                name: true,
                icon: true,
                subvariables: {
                    where: { active: true },
                    take: 1,
                    select: {
                        id: true,
                        name: true,
                    },
                },
                entries: {
                    where: {
                        logicalDate: {
                            gte: startDate,
                            lte: endDate,
                        },
                    },
                    select: {
                        logicalDate: true,
                        subvariableEntries: {
                            select: {
                                subvariableId: true,
                                numericValue: true,
                            },
                        },
                    },
                },
            },
        });

        // Build variables list (only habits with subvariables and data)
        const variables: { id: string; name: string; habitName: string; habitIcon: string }[] = [];
        const dataByVariable = new Map<string, Map<string, number>>();

        for (const habit of habits) {
            const sub = habit.subvariables[0];
            if (!sub) continue;

            // Build date-value map for this variable
            const dateValueMap = new Map<string, number>();
            for (const entry of habit.entries) {
                const dateStr = entry.logicalDate.toISOString().split('T')[0];
                const subEntry = entry.subvariableEntries.find(se => se.subvariableId === sub.id);
                if (subEntry) {
                    dateValueMap.set(dateStr, subEntry.numericValue);
                }
            }

            // Only include if has data
            if (dateValueMap.size >= 3) {
                variables.push({
                    id: sub.id,
                    name: sub.name,
                    habitName: habit.name,
                    habitIcon: habit.icon,
                });
                dataByVariable.set(sub.id, dateValueMap);
            }
        }

        // Calculate correlation matrix
        const n = variables.length;
        const matrix: (number | null)[][] = [];

        for (let i = 0; i < n; i++) {
            const row: (number | null)[] = [];
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    row.push(1); // Self-correlation is 1
                } else {
                    const var1Data = dataByVariable.get(variables[i].id)!;
                    const var2Data = dataByVariable.get(variables[j].id)!;
                    row.push(calculatePearson(var1Data, var2Data));
                }
            }
            matrix.push(row);
        }

        return NextResponse.json({ variables, matrix });
    } catch (error) {
        console.error('Error calculating correlations:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Calculate Pearson correlation between two date-indexed datasets
 */
function calculatePearson(
    data1: Map<string, number>,
    data2: Map<string, number>
): number | null {
    // Find overlapping dates
    const pairs: { x: number; y: number }[] = [];

    for (const [date, value1] of data1) {
        const value2 = data2.get(date);
        if (value2 !== undefined) {
            pairs.push({ x: value1, y: value2 });
        }
    }

    if (pairs.length < 3) return null;

    const n = pairs.length;
    const sumX = pairs.reduce((acc, p) => acc + p.x, 0);
    const sumY = pairs.reduce((acc, p) => acc + p.y, 0);
    const sumXY = pairs.reduce((acc, p) => acc + p.x * p.y, 0);
    const sumX2 = pairs.reduce((acc, p) => acc + p.x * p.x, 0);
    const sumY2 = pairs.reduce((acc, p) => acc + p.y * p.y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return null;

    return Math.round((numerator / denominator) * 100) / 100;
}
