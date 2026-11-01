import { NextRequest, NextResponse } from 'next/server';
import { purgeRetention } from '@/lib/retention';

const authorize = (request: NextRequest) => {
    const vercelCronHeader = request.headers.get('x-vercel-cron');
    if (vercelCronHeader) return true;
    const secret = process.env.RETENTION_TASK_SECRET;
    if (!secret) return false;
    const authHeader = request.headers.get('authorization');
    const querySecret = request.nextUrl.searchParams.get('secret');
    return authHeader === `Bearer ${secret}` || querySecret === secret;
};

const handlePurge = async () => {
    try {
        const result = await purgeRetention();
        return NextResponse.json(result);
    } catch (error) {
        console.error('Retention purge failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

export async function POST(request: NextRequest) {
    if (!authorize(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handlePurge();
}

export async function GET(request: NextRequest) {
    if (!authorize(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handlePurge();
}
