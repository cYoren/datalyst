import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/ensure-user';

/** DELETE /api/user/api-keys/:id revokes a key immediately. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { count } = await prisma.apiKey.updateMany({
        where: { id, userId: user.id, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
    });
    if (count === 0) return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    return NextResponse.json({ success: true });
}
