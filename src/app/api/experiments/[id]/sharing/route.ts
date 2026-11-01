import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
    const user = await getAuthenticatedUser();
    const headers = { 'Cache-Control': 'no-store, private' };
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    const parsed = z.object({ isPublic: z.boolean(), confirm: z.boolean().optional() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Invalid sharing request' }, { status: 400, headers });
    if (parsed.data.isPublic && parsed.data.confirm !== true) return Response.json({ error: 'Explicit public sharing confirmation required' }, { status: 400, headers });
    const { id } = await params;
    const experiment = await prisma.experiment.findFirst({ where: { id, userId: user.id }, select: { slug: true, status: true } });
    if (!experiment) return Response.json({ error: 'Experiment not found' }, { status: 404, headers });
    if (parsed.data.isPublic && experiment.status !== 'COMPLETED') return Response.json({ error: 'Complete the experiment before publishing results' }, { status: 409, headers });
    const slug = experiment.slug ?? randomBytes(18).toString('hex');
    const updated = await prisma.experiment.updateMany({ where: { id, userId: user.id, ...(parsed.data.isPublic && { status: 'COMPLETED' }) }, data: { isPublic: parsed.data.isPublic, slug } });
    if (!updated.count) return Response.json({ error: 'Experiment changed; reload and try again' }, { status: 409, headers });
    return Response.json({ isPublic: parsed.data.isPublic, slug }, { headers });
    } catch {
        return Response.json({ error: 'Sharing service unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store, private' } });
    }
}
