import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { ensureUserExists } from './ensure-user';

const row = (id: string, email: string) => ({ id, email, onboardingCompleted: false });

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ensureUserExists identity rules', () => {
    it('returns the row when the authenticated id already has one', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(row('user-a', 'a@example.com'));
        await expect(ensureUserExists('user-a', 'a@example.com')).resolves.toMatchObject({ id: 'user-a' });
        expect(prismaMock.user.update).not.toHaveBeenCalled();
        expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('creates a row for a new identity', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
        prismaMock.user.create.mockResolvedValue(row('user-b', 'b@example.com'));
        await expect(ensureUserExists('user-b', 'b@example.com')).resolves.toMatchObject({ id: 'user-b' });
        expect(prismaMock.user.create).toHaveBeenCalledWith({
            data: { id: 'user-b', email: 'b@example.com', onboardingCompleted: false },
        });
    });

    it('never adopts a row that another identity created under the same email', async () => {
        // An account whose Supabase identity is gone: the row survives, and Supabase
        // autoconfirms signups, so anyone can claim the address next.
        prismaMock.user.findUnique
            .mockResolvedValueOnce(null) // no row for the new id
            .mockResolvedValueOnce(row('user-a', 'a@example.com')); // the orphan
        prismaMock.user.create.mockResolvedValue(row('user-b', 'a@example.com'));

        const created = await ensureUserExists('user-b', 'a@example.com');

        // The new identity gets its own empty account...
        expect(created).toMatchObject({ id: 'user-b' });
        // ...and the old row is quarantined rather than handed over: its id is untouched,
        // so its habits and entries stay with it.
        expect(prismaMock.user.update).toHaveBeenCalledWith({
            where: { id: 'user-a' },
            data: { email: 'user-a@orphaned.invalid' },
        });
        expect(prismaMock.user.update).not.toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ id: expect.anything() }) }),
        );
    });

    it('returns the row when a concurrent request created it first', async () => {
        prismaMock.user.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(row('user-c', 'c@example.com'));
        prismaMock.user.create.mockRejectedValue(new Error('unique constraint'));
        await expect(ensureUserExists('user-c', 'c@example.com')).resolves.toMatchObject({ id: 'user-c' });
    });
});
