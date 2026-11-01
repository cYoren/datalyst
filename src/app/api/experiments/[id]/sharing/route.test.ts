// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/ensure-user', () => ({ getAuthenticatedUser: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { experiment: { findFirst: mocks.find, updateMany: mocks.update } } }));
import { POST } from './route';
const call = (body: unknown) => POST(new Request('http://localhost/api/experiments/synthetic/sharing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'synthetic' }) });
describe('explicit public sharing', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: 'owner' }); mocks.find.mockResolvedValue({ status: 'COMPLETED', slug: null }); mocks.update.mockResolvedValue({ count: 1 }); });
    it('requires authentication and ownership', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await call({ isPublic: true, confirm: true })).status).toBe(401);
        expect(mocks.find).not.toHaveBeenCalled();
        mocks.auth.mockResolvedValue({ id: 'outsider' }); mocks.find.mockResolvedValue(null);
        expect((await call({ isPublic: true, confirm: true })).status).toBe(404);
        expect(mocks.find).toHaveBeenCalledWith({ where: { id: 'synthetic', userId: 'outsider' }, select: { slug: true, status: true } });
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('requires explicit consent and rejects injected actor identities', async () => {
        expect((await call({ isPublic: true })).status).toBe(400);
        expect((await call({ isPublic: true, confirm: true, userId: 'victim' })).status).toBe(400);
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('requires completion and checks that requirement atomically on publication', async () => {
        mocks.find.mockResolvedValue({ status: 'ACTIVE', slug: null });
        expect((await call({ isPublic: true, confirm: true })).status).toBe(409);
        expect(mocks.update).not.toHaveBeenCalled();
        mocks.find.mockResolvedValue({ status: 'COMPLETED', slug: null });
        const response = await call({ isPublic: true, confirm: true });
        const body = await response.json();
        expect(body.slug).toMatch(/^[a-f0-9]{36}$/);
        expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'synthetic', userId: 'owner', status: 'COMPLETED' }, data: { isPublic: true, slug: body.slug } });
    });
    it('permits revocation after archiving and preserves a stable public URL', async () => {
        mocks.find.mockResolvedValue({ status: 'ARCHIVED', slug: 'existing-public-slug' });
        expect((await call({ isPublic: false })).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'synthetic', userId: 'owner' }, data: { isPublic: false, slug: 'existing-public-slug' } });
    });
    it('reports a publication race without a false success', async () => {
        mocks.update.mockResolvedValue({ count: 0 });
        expect((await call({ isPublic: true, confirm: true })).status).toBe(409);
    });
});
