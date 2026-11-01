import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { HEALTH_SOURCES } from '@/lib/health-metrics';
import { connectHealthImport, HealthImportError } from '@/services/health-import.service';
import { checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';

const schema = z.object({ source: z.enum(HEALTH_SOURCES), expectedUserId: z.string().min(1), consent: z.literal(true), previousConnectionId: z.string().optional() });
export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const limit = checkAgentRateLimit(`health-connect:${user.id}`, 10);
    if (!limit.allowed) return rateLimitedResponse(limit);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid health connection' }, { status: 400 });
    if (parsed.data.expectedUserId !== user.id) return NextResponse.json({ error: 'Account changed; connect health again' }, { status: 409 });
    try {
        return NextResponse.json(await connectHealthImport(user.id, parsed.data.source, parsed.data.previousConnectionId), { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return NextResponse.json({ error: error instanceof HealthImportError ? error.message : 'Connection failed' }, { status: error instanceof HealthImportError ? error.status : 500 });
    }
}
