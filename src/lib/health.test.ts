import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), aggregated: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true, getPlatform: () => 'ios' } }));
vi.mock('@capgo/capacitor-health', () => ({ Health: { isAvailable: async () => ({ available: true }), readSamples: mocks.read, queryAggregated: mocks.aggregated } }));

describe('Health device settings account isolation', () => {
    let account: string;
    let storage: Map<string, string>;
    let requests: { url: string; options?: RequestInit }[];
    beforeEach(() => {
        vi.resetModules(); account = 'alice'; storage = new Map(); requests = [];
        Object.defineProperty(window, 'localStorage', { configurable: true, value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
        } });
        mocks.aggregated.mockResolvedValue({ samples: [{ startDate: new Date().toISOString(), value: 100 }] });
        vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
            requests.push({ url, options });
            return new Response(JSON.stringify(url === '/api/user' ? { id: account } : {}), { status: 200 });
        }));
    });
    function saved(owner: string) {
        storage.set(`datalyst:health-v2:${owner}`, JSON.stringify({ ownerId: owner, connectionId: `device-${owner}`, metrics: ['steps'], lastSync: null }));
    }
    it('does not reuse another account connection or unbound legacy preferences', async () => {
        saved('alice'); storage.set('datalyst:health-v1', JSON.stringify({ metrics: ['steps'], lastSync: null }));
        account = 'bob';
        const health = await import('./health');
        await health.syncHealth(true);
        expect(health.readHealthSetting().metrics).toEqual([]);
        expect(requests.filter(r => r.url === '/api/health/import')).toHaveLength(0);
        expect(storage.has('datalyst:health-v1')).toBe(false);
    });
    it('includes the account-bound connection on imports', async () => {
        saved('alice');
        const health = await import('./health');
        expect(await health.syncHealth(true)).toBe(true);
        const imported = requests.find(r => r.url === '/api/health/import')!;
        expect(JSON.parse(String(imported.options?.body)).connectionId).toBe('device-alice');
    });
    it('stops before posting if the signed-in account switches during a native read', async () => {
        saved('alice');
        mocks.aggregated.mockImplementation(async () => { account = 'bob'; return { samples: [{ startDate: new Date().toISOString(), value: 100 }] }; });
        const health = await import('./health');
        expect(await health.syncHealth(true)).toBe(false);
        expect(requests.filter(r => r.url === '/api/health/import')).toHaveLength(0);
    });
    it('revokes the server connection when disconnecting without data deletion', async () => {
        saved('alice');
        const health = await import('./health');
        expect(await health.disconnectHealth(false)).toBe(true);
        const request = requests.find(r => r.url === '/api/health/import')!;
        expect(request.options?.method).toBe('DELETE');
        expect(JSON.parse(String(request.options?.body))).toEqual({ connectionId: 'device-alice', deleteData: false });
        expect(storage.has('datalyst:health-v2:alice')).toBe(false);
    });
});
