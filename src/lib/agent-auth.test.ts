// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const prismaMock = vi.hoisted(() => ({
    apiKey: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { authenticateAgent, extractApiKey, generateApiKey, hashApiKey, hasScope } from './agent-auth';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const req = (headers: Record<string, string>) => new Request('http://localhost/api/mcp', { headers });

describe('API key hashing', () => {
    it('generates a random dl_ key whose hash and prefix match', () => {
        const a = generateApiKey();
        const b = generateApiKey();
        expect(a.key).toMatch(/^dl_[A-Za-z0-9_-]{43}$/);
        expect(a.key).not.toBe(b.key);
        expect(a.keyHash).toBe(sha(a.key));
        expect(a.keyHash).not.toContain(a.key);
        expect(a.prefix).toBe(a.key.slice(0, 10));
    });

    it('extracts the key from Bearer or X-API-Key', () => {
        expect(extractApiKey(new Headers({ Authorization: 'Bearer dl_abc' }))).toBe('dl_abc');
        expect(extractApiKey(new Headers({ 'X-API-Key': 'sk_legacy' }))).toBe('sk_legacy');
        expect(extractApiKey(new Headers({ Authorization: 'Basic xyz' }))).toBeNull();
        expect(extractApiKey(new Headers())).toBeNull();
    });
});

describe('authenticateAgent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.apiKey.update.mockResolvedValue({});
    });

    const record = { id: 'k1', name: 'Claude', agentId: null, userId: 'u1', isActive: true, revokedAt: null, scopes: ['read'], rateLimitPerMinute: 60 };

    it('looks keys up by hash only, never by plaintext', async () => {
        prismaMock.apiKey.findUnique.mockResolvedValue(record);
        const agent = await authenticateAgent(req({ Authorization: 'Bearer dl_secret' }));
        expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { keyHash: hashApiKey('dl_secret') } }));
        expect(JSON.stringify(prismaMock.apiKey.findUnique.mock.calls)).not.toContain('dl_secret');
        expect(agent).toMatchObject({ apiKeyId: 'k1', userId: 'u1', scopes: ['read'] });
    });

    it('rejects unknown, inactive and revoked keys', async () => {
        prismaMock.apiKey.findUnique.mockResolvedValueOnce(null);
        expect(await authenticateAgent(req({ 'X-API-Key': 'nope' }))).toBeNull();
        prismaMock.apiKey.findUnique.mockResolvedValueOnce({ ...record, isActive: false });
        expect(await authenticateAgent(req({ 'X-API-Key': 'k' }))).toBeNull();
        prismaMock.apiKey.findUnique.mockResolvedValueOnce({ ...record, revokedAt: new Date() });
        expect(await authenticateAgent(req({ 'X-API-Key': 'k' }))).toBeNull();
        expect(await authenticateAgent(req({}))).toBeNull();
    });

    it('enforces scopes', () => {
        expect(hasScope({ scopes: ['read'] }, 'read')).toBe(true);
        expect(hasScope({ scopes: ['read'] }, 'write')).toBe(false);
        expect(hasScope({ scopes: ['read', 'write'] }, 'write')).toBe(true);
    });
});
