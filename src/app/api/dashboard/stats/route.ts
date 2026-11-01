import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DashboardService } from '@/services/dashboard.service';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [
            streak,
            weeklyCompletion,
            consistency,
            dailyProgress,
            weeklySummary
        ] = await Promise.all([
            DashboardService.calculateUserStreak(user.id),
            DashboardService.getCompletionRate(user.id, 7),
            DashboardService.getConsistencyScore(user.id),
            DashboardService.getDailyProgress(user.id),
            DashboardService.getWeeklySummary(user.id),
        ]);

        return NextResponse.json({
            streak,
            weeklyCompletion,
            consistency,
            dailyProgress,
            weeklySummary,
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
