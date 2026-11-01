// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const prismaMock = vi.hoisted(() => ({
    apiKey: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
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
