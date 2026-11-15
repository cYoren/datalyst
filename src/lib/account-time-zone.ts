/** The account's time zone, for anything that must speak in the person's own calendar day. */
import { prisma } from '@/lib/prisma';

export async function accountTimeZone(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return user?.timezone ?? null;
}
