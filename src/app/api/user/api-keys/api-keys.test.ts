// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const prismaMock = vi.hoisted(() => ({
    apiKey: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    habit: { findMany: vi.fn() },
}));
const userMock = vi.hoisted(() => ({ current: { id: 'alice' } as { id: string } | null }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/ensure-user', () => ({ getAuthenticatedUser: async () => userMock.current }));

import { GET, POST } from './route';
import { DELETE } from './[id]/route';

const create = (body: unknown) => POST(new Request('http://localhost/api/user/api-keys', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
    vi.clearAllMocks();
    userMock.current = { id: 'alice' };
    prismaMock.apiKey.count.mockResolvedValue(0);
    prismaMock.apiKey.create.mockImplementation(async ({ data }) => ({ id: 'k1', name: data.name, prefix: data.prefix, scopes: data.scopes }));
});

describe('self-serve API keys', () => {
    it('returns the key once and stores only its hash', async () => {
        const res = await create({ name: 'Claude', scopes: ['write', 'read', 'read'] });
        expect(res.status).toBe(201);
        const { key, apiKey } = await res.json();
        const data = prismaMock.apiKey.create.mock.calls[0][0].data;
        expect(data.keyHash).toBe(createHash('sha256').update(key).digest('hex'));
        expect(data.key).toBeUndefined();
        expect(JSON.stringify(data)).not.toContain(key);
        expect(data).toMatchObject({ userId: 'alice', scopes: ['read', 'write'], prefix: key.slice(0, 10) });
        expect(apiKey.prefix).toBe(key.slice(0, 10));
    });

    it('defaults to read only and validates input', async () => {
        await create({ name: 'Cursor' });
        expect(prismaMock.apiKey.create.mock.calls[0][0].data.scopes).toEqual(['read']);
        expect((await create({ name: '', scopes: ['read'] })).status).toBe(400);
        expect((await create({ name: 'x', scopes: ['admin'] })).status).toBe(400);
    });

    it('caps active keys per user', async () => {
        prismaMock.apiKey.count.mockResolvedValue(10);
        expect((await create({ name: 'x' })).status).toBe(400);
    });

    it('requires a session', async () => {
        userMock.current = null;
        expect((await GET()).status).toBe(401);
        expect((await create({ name: 'x' })).status).toBe(401);
    });

    it('lists and revokes only the user\'s own keys', async () => {
        prismaMock.apiKey.findMany.mockResolvedValue([]);
        prismaMock.habit.findMany.mockResolvedValue([]);
        await GET();
        expect(prismaMock.apiKey.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'alice', isActive: true });
        expect(prismaMock.apiKey.findMany.mock.calls[0][0].select.keyHash).toBeUndefined();

        prismaMock.apiKey.updateMany.mockResolvedValue({ count: 0 });
        const res = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: 'bobs_key' }) });
        expect(res.status).toBe(404);
        expect(prismaMock.apiKey.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'bobs_key', userId: 'alice' });

        prismaMock.apiKey.updateMany.mockResolvedValue({ count: 1 });
        const ok = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: 'k1' }) });
        expect(ok.status).toBe(200);
        expect(prismaMock.apiKey.updateMany.mock.calls[1][0].data).toMatchObject({ isActive: false });
    });
});

describe('the key activity list (S3)', () => {
    it('returns actions with a tracker name and never a value', async () => {
        prismaMock.apiKey.findMany.mockResolvedValue([
            {
                id: 'key-1', name: 'Assistant', prefix: 'dl_abc', scopes: ['read', 'write'],
                createdAt: new Date('2026-11-01'), lastUsedAt: new Date('2026-11-14'),
                appId: null, readableSubvariableIds: [],
                events: [
                    { id: 'e1', action: 'write', createdAt: new Date('2026-11-14T09:00:00Z'), logicalDate: new Date('2026-11-14'), habitId: 'habit-1' },
                    { id: 'e2', action: 'read', createdAt: new Date('2026-11-14T08:00:00Z'), logicalDate: null, habitId: null },
                ],
            },
        ]);
        prismaMock.habit.findMany.mockResolvedValue([{ id: 'habit-1', name: 'Sleep quality' }]);

        const response = await GET();
        const { keys } = await response.json();

        expect(keys[0].events).toEqual([
            expect.objectContaining({ action: 'write', habitName: 'Sleep quality' }),
            expect.objectContaining({ action: 'read', habitName: null }),
        ]);
        // The event row has no value column and the response must not invent one.
        expect(JSON.stringify(keys)).not.toMatch(/numericValue|rawValue|value/i);
        // Names are resolved only for this user's trackers.
        expect(prismaMock.habit.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'alice' });
    });
});

describe('ordering the activity list (S3 review)', () => {
    it('shows writes before read polls, so a polling assistant does not hide its own actions', async () => {
        const read = (n: number) => ({
            id: `r${n}`, action: 'read', createdAt: new Date(`2026-11-14T1${n}:00:00Z`), logicalDate: null, habitId: null,
        });
        prismaMock.apiKey.findMany.mockResolvedValue([
            {
                id: 'key-1', name: 'Assistant', prefix: 'dl_abc', scopes: ['read', 'write'],
                createdAt: new Date('2026-11-01'), lastUsedAt: new Date('2026-11-14'), appId: null, readableSubvariableIds: [],
                events: [
                    read(0), read(1), read(2), read(3),
                    { id: 'w1', action: 'write', createdAt: new Date('2026-11-14T09:00:00Z'), logicalDate: new Date('2026-11-13T00:00:00Z'), habitId: 'habit-1' },
                    read(4),
                ],
            },
        ]);
        prismaMock.habit.findMany.mockResolvedValue([{ id: 'habit-1', name: 'Sleep quality' }]);

        const { keys } = await (await GET()).json();

        expect(keys[0].events[0]).toMatchObject({ action: 'write', habitName: 'Sleep quality' });
        expect(keys[0].events).toHaveLength(5);
        expect(keys[0].events.filter((event: { action: string }) => event.action === 'write')).toHaveLength(1);
    });
});
