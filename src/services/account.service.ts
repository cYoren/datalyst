import { prisma } from '@/lib/prisma';

/** Remove researcher-owned protocols as well as FK-owned personal records. */
export async function deleteAccountRecords(userId: string) {
    await prisma.$transaction(async tx => {
        await tx.study.deleteMany({ where: { members: { some: { userId, role: 'OWNER' } } } });
        await tx.user.delete({ where: { id: userId } });
    });
}
