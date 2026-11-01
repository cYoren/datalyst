import { NextResponse } from 'next/server';
import { StatsService } from '@/services/stats.service';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// Cache duration: 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000;

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check for cached insights
        const cached = await prisma.insightsCache.findUnique({
            where: { userId: user.id }
        });

        const now = new Date();

        // Return cached data if still valid
        if (cached && cached.expiresAt > now) {
            return NextResponse.json({
                correlations: Array.isArray((cached.data as { correlations?: unknown }).correlations)
                    ? (cached.data as { correlations: unknown[] }).correlations
                    : [],
                generatedAt: cached.createdAt,
                cached: true
            });
        }

        // Calculate fresh correlations
        const correlations = await StatsService.calculateGlobalCorrelations(user.id);
        const topCorrelations = correlations.slice(0, 10);

        // Store in cache (upsert)
        const expiresAt = new Date(now.getTime() + CACHE_DURATION_MS);

        await prisma.insightsCache.upsert({
            where: { userId: user.id },
            update: {
                data: { correlations: topCorrelations },
                createdAt: now,
                expiresAt
            },
            create: {
                userId: user.id,
                data: { correlations: topCorrelations },
                expiresAt
            }
        });

        return NextResponse.json({
            correlations: topCorrelations,
            generatedAt: now,
            cached: false
        });
    } catch (error) {
        console.error('Error generating insights:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST endpoint to force cache refresh
export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Delete existing cache to force refresh
        await prisma.insightsCache.deleteMany({
            where: { userId: user.id }
        });

        // Calculate fresh correlations
        const correlations = await StatsService.calculateGlobalCorrelations(user.id);
        const topCorrelations = correlations.slice(0, 10);

        // Store fresh cache
        const now = new Date();
        const expiresAt = new Date(now.getTime() + CACHE_DURATION_MS);

        await prisma.insightsCache.create({
            data: {
                userId: user.id,
                data: { correlations: topCorrelations },
                expiresAt
            }
        });

        return NextResponse.json({
            correlations: topCorrelations,
            generatedAt: now,
            cached: false,
            message: 'Cache refreshed'
        });
    } catch (error) {
        console.error('Error refreshing insights:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
