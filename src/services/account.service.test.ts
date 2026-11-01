import { expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ study: { deleteMany: vi.fn() }, user: { delete: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: (run: (tx: typeof db) => Promise<void>) => run(db) } }));
import { deleteAccountRecords } from './account.service';

it('deletes only studies owned by the deleting user before cascading personal records', async () => {
    await deleteAccountRecords('deleting-user');
    expect(db.study.deleteMany).toHaveBeenCalledWith({ where: { members: { some: { userId: 'deleting-user', role: 'OWNER' } } } });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'deleting-user' } });
    expect(db.study.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(db.user.delete.mock.invocationCallOrder[0]);
});
