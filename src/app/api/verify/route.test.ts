// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/crypto/verify-bundle', () => ({ verifyBundle: mocks.verify }));
vi.mock('@/lib/agent-rate-limit', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/agent-rate-limit')>(), checkAgentRateLimit: mocks.limit }));
import { POST } from './route';
beforeEach(() => { vi.clearAllMocks(); });
it('rejects rate-limited public requests before verifying or calling RPC', async () => {
    mocks.limit.mockReturnValue({ allowed: false, limit: 60, remaining: 0, resetSeconds: 30 });
    const response = await POST(new Request('http://localhost/api/verify', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(mocks.verify).not.toHaveBeenCalled();
});
