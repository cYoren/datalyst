import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { HabitService } from '@/services/habit.service';
import { DashboardService } from '@/services/dashboard.service';
import { StatsService } from '@/services/stats.service';
import { prisma } from '@/lib/prisma';

// Cache duration for insights: 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000;

export async function GET() {
    try {
        const userObj = await getAuthenticatedUser();

        if (!userObj) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = userObj.id;

        // Fetch core data in parallel - don't wait for insights
        const [
            habits,
            weeklyCompletion,
            dailyProgress,
            weeklySummary,
            totalLoggingDays,
            user,
            cachedInsights
        ] = await Promise.all([
            HabitService.getUserHabits(userId),
            DashboardService.getCompletionRate(userId, 7),
            DashboardService.getDailyProgress(userId),
            DashboardService.getWeeklySummary(userId),
            DashboardService.getTotalLoggingDays(userId),
            prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, name: true }
            }),
            prisma.insightsCache.findUnique({ where: { userId } })
        ]);

        const now = new Date();
        let insights: { correlations: unknown[]; generatedAt: Date; cached: boolean; loading?: boolean };

        // Check cache - if valid, use it
        if (cachedInsights && cachedInsights.expiresAt > now) {
            insights = {
                correlations: Array.isArray((cachedInsights.data as { correlations?: unknown }).correlations)
                    ? (cachedInsights.data as { correlations: unknown[] }).correlations
                    : [],
                generatedAt: cachedInsights.createdAt,
                cached: true
            };
        } else {
            // Return empty insights immediately so page loads fast
            // Trigger background calculation
            insights = {
                correlations: [],
                generatedAt: now,
                cached: false,
                loading: true // Signal to client that insights are being calculated
            };

            // Background: Calculate and cache (fire and forget)
            setImmediate(async () => {
                try {
                    const correlations = await StatsService.calculateGlobalCorrelations(userId);
                    const topCorrelations = correlations.slice(0, 10);
                    const expiresAt = new Date(Date.now() + CACHE_DURATION_MS);

                    await prisma.insightsCache.upsert({
                        where: { userId },
                        update: { data: { correlations: topCorrelations }, createdAt: new Date(), expiresAt },
                        create: { userId, data: { correlations: topCorrelations }, expiresAt }
                    });
                } catch (err) {
                    console.error('Background insights calculation failed:', err);
                }
            });
        }

        return NextResponse.json({
            habits,
            stats: {
                weeklyCompletion,
                dailyProgress,
                weeklySummary,
                totalLoggingDays
            },
            insights,
            user
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
