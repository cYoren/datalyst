import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { checkAgentRateLimit, rateLimitedResponse } from '@/lib/agent-rate-limit';
import { importSchema } from '@/lib/health-metrics';
import { disconnectHealthImport, HealthImportError, importHealthBatch } from '@/services/health-import.service';

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const limit = checkAgentRateLimit(`health-import:${user.id}`, 30);
    if (!limit.allowed) return rateLimitedResponse(limit);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    let body: z.infer<typeof importSchema>;
    try { body = importSchema.parse(JSON.parse(raw)); }
    catch { return NextResponse.json({ error: 'Invalid health import' }, { status: 400 }); }
    try { return NextResponse.json(await importHealthBatch(user.id, body)); }
    catch (error) { return failure(error); }
}

const disconnectSchema = z.object({ connectionId: z.string().min(1), deleteData: z.boolean().default(false) });
export async function DELETE(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = disconnectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    try { return NextResponse.json(await disconnectHealthImport(user.id, parsed.data.connectionId, parsed.data.deleteData)); }
    catch (error) { return failure(error); }
}
function failure(error: unknown) {
    return NextResponse.json({ error: error instanceof HealthImportError ? error.message : 'Health import failed' }, { status: error instanceof HealthImportError ? error.status : 500 });
}
