// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
    habit: { count: vi.fn(), create: vi.fn() },
    habitEntry: { create: vi.fn() },
    subvariableEntry: { create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'synthetic@example.test' } } }) } }),
}));
vi.mock('@/lib/ensure-user', () => ({ ensureUserExists: async () => ({ id: 'u1' }) }));

import { POST } from './route';

describe('sample data', () => {
    beforeEach(() => vi.clearAllMocks());

    it('says why it added nothing when the account already has trackers', async () => {
        db.habit.count.mockResolvedValue(3);
        const response = await POST();
        expect(response.status).toBe(409);
        expect((await response.json()).error).toMatch(/empty account/i);
        expect(db.habit.create).not.toHaveBeenCalled();
        expect(db.habitEntry.create).not.toHaveBeenCalled();
    });
});
