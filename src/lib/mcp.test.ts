// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashApiKey } from './agent-auth';

const prismaMock = vi.hoisted(() => ({
    apiKey: { findUnique: vi.fn(), update: vi.fn() },
    habit: { findMany: vi.fn(), findFirst: vi.fn() },
    habitEntry: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    subvariableEntry: { create: vi.fn(), update: vi.fn() },
    experiment: { findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { handleMcpPost } from './mcp';

const KEYS: Record<string, { id: string; userId: string; scopes: string[] }> = {
    dl_read: { id: 'k_read', userId: 'alice', scopes: ['read'] },
    dl_write: { id: 'k_write', userId: 'alice', scopes: ['read', 'write'] },
};

function post(body: unknown, key: string | null = 'dl_write', headers: Record<string, string> = {}) {
    return handleMcpPost(new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(key && { Authorization: `Bearer ${key}` }),
            ...headers,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
}

const call = (name: string, args: unknown, key?: string) =>
    post({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }, key);

async function toolResult(res: Response) {
    const body = await res.json();
    return { ...body.result, text: body.result.content[0].text as string };
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.apiKey.update.mockResolvedValue({});
    prismaMock.apiKey.findUnique.mockImplementation(async ({ where }: { where: { keyHash: string } }) => {
        const entry = Object.entries(KEYS).find(([key]) => hashApiKey(key) === where.keyHash);
        if (!entry) return null;
        const [, k] = entry;
        return { id: k.id, name: 'test', agentId: null, userId: k.userId, isActive: true, revokedAt: null, scopes: k.scopes, rateLimitPerMinute: 1000 };
    });
});

describe('MCP transport', () => {
    it('rejects missing and unknown keys with 401', async () => {
        const missing = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, null);
        expect(missing.status).toBe(401);
        expect(missing.headers.get('www-authenticate')).toContain('Bearer');
        expect((await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'dl_unknown')).status).toBe(401);
    });

    it('initializes and negotiates the protocol version', async () => {
        const res = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.id).toBe(1);
        expect(body.result.protocolVersion).toBe('2025-06-18');
        expect(body.result.capabilities.tools).toBeDefined();
        expect(body.result.serverInfo.name).toBe('datalyst');

        const unknown = await (await post({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).json();
        expect(unknown.result.protocolVersion).toBe('2025-11-25');
    });

    it('accepts notifications with 202 and answers ping', async () => {
        expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
        expect(await (await post({ jsonrpc: '2.0', id: 'p', method: 'ping' })).json()).toEqual({ jsonrpc: '2.0', id: 'p', result: {} });
    });

    it('lists all tools with JSON schemas', async () => {
        const body = await (await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
        const names = body.result.tools.map((t: { name: string }) => t.name);
        expect(names).toEqual(['get_study_protocol_schema', 'list_studies', 'create_study_draft', 'get_study_evidence', 'list_trackers', 'create_tracker', 'get_today', 'parse_log', 'log_checkin', 'get_entries', 'get_correlations', 'list_experiments', 'create_experiment', 'get_experiment_results', 'export_data']);
        for (const t of body.result.tools) {
            expect(t.inputSchema.type).toBe('object');
            expect(t.inputSchema.$schema).toBeUndefined();
            expect(t.description.length).toBeGreaterThan(20);
        }
        const log = body.result.tools.find((t: { name: string }) => t.name === 'log_checkin');
        expect(log.inputSchema.required).toEqual(expect.arrayContaining(['habitId', 'subvariableId', 'numericValue', 'logicalDate']));
        expect(log.annotations.readOnlyHint).toBe(false);
    });

    it('returns JSON-RPC errors for bad input', async () => {
        const parse = await post('{not json');
        expect(parse.status).toBe(400);
        expect((await parse.json()).error.code).toBe(-32700);
        expect((await (await post({ jsonrpc: '2.0', id: 1, method: 'resources/list' })).json()).error.code).toBe(-32601);
        expect((await (await post({ id: 1, method: 'ping' })).json()).error.code).toBe(-32600);
        expect((await (await call('drop_tables', {})).json()).error.code).toBe(-32602);
        const version = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'dl_write', { 'MCP-Protocol-Version': '1999-01-01' });
        expect(version.status).toBe(400);
    });

    it('rejects batches so each request is one rate-limited call', async () => {
        const res = await post([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'ping' }]);
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe(-32600);
    });

    it('limits a key carried in the URL to read access', async () => {
        const path = { 'x-api-key-transport': 'path' };
        // A URL ends up in request logs, so a write key arriving that way is refused
        // before any tool runs.
        const write = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'dl_write', path);
        expect(write.status).toBe(403);
        const body = await write.json();
        expect(body.error.code).toBe(-32003);
        expect(body.error.message).toContain('read');

        // A read-only key in the URL still works: that is the connector case.
        expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'dl_read', path)).status).toBe(200);
        // The same write key over the header transport keeps its scopes.
        expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'dl_write')).status).toBe(200);
    });
});

describe('MCP tools', () => {
    it('list_trackers only queries the key owner', async () => {
        prismaMock.habit.findMany.mockResolvedValue([{
            id: 'h1', name: 'Sleep', icon: 'x', scheduleType: 'DAILY', scheduleDays: [], timeBlock: 'ANYTIME', schedule: '{}',
            subvariables: [{ id: 's1', name: 'Hours', type: 'NUMERIC', unit: 'h', goalDirection: 'HIGHER_BETTER', prompt: null, metadata: '{}' }],
        }]);
        const result = await toolResult(await call('list_trackers', {}, 'dl_read'));
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.text)[0]).toMatchObject({ id: 'h1', variables: [{ id: 's1', name: 'Hours' }] });
        expect(prismaMock.habit.findMany.mock.calls[0][0].where.userId).toBe('alice');
    });

    it('log_checkin needs the write scope', async () => {
        const result = await toolResult(await call('log_checkin', { habitId: 'h1', subvariableId: 's1', numericValue: 7, logicalDate: '2026-10-06' }, 'dl_read'));
        expect(result.isError).toBe(true);
        expect(result.text).toContain('write');
        expect(prismaMock.habit.findFirst).not.toHaveBeenCalled();
    });

    it('log_checkin cannot touch another user\'s tracker', async () => {
        // Bob's tracker: the ownership query scoped to alice finds nothing.
        prismaMock.habit.findFirst.mockImplementation(async ({ where }: { where: { userId: string } }) =>
            where.userId === 'bob' ? { id: 'bob_h', subvariables: [{ id: 'bob_s' }] } : null);
        const result = await toolResult(await call('log_checkin', { habitId: 'bob_h', subvariableId: 'bob_s', numericValue: 1, logicalDate: '2026-10-06' }));
        expect(result.isError).toBe(true);
        expect(result.text).toContain('not found');
        expect(prismaMock.habitEntry.create).not.toHaveBeenCalled();
        expect(prismaMock.subvariableEntry.create).not.toHaveBeenCalled();
    });

    it('log_checkin writes through the quick-entry logic', async () => {
        prismaMock.habit.findFirst.mockResolvedValue({ id: 'h1', subvariables: [{ id: 's1' }] });
        prismaMock.experiment.findFirst.mockResolvedValue(null);
        prismaMock.habitEntry.findFirst.mockResolvedValue(null);
        prismaMock.habitEntry.create.mockResolvedValue({ id: 'e1', subvariableEntries: [] });
        prismaMock.subvariableEntry.create.mockResolvedValue({ id: 'se1', numericValue: 7, rawValue: null });
        const result = await toolResult(await call('log_checkin', { habitId: 'h1', subvariableId: 's1', numericValue: 7, logicalDate: '2026-10-06' }));
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.text)).toMatchObject({ success: true, created: true, entry: { habitEntryId: 'e1', numericValue: 7 } });
        expect(prismaMock.habitEntry.create.mock.calls[0][0].data.userId).toBe('alice');
    });

    it.each([
        ['BOOLEAN', 99], ['BOOLEAN', -1], ['SCALE_0_10', 11], ['SCALE_0_10', -0.5],
    ])('rejects out-of-range %s values before writing', async (type, numericValue) => {
        prismaMock.habit.findFirst.mockResolvedValue({ id: 'h1', subvariables: [{ id: 's1', type, metadata: '{}' }] });
        const result = await toolResult(await call('log_checkin', { habitId: 'h1', subvariableId: 's1', numericValue, logicalDate: '2026-10-06' }));
        expect(result.isError).toBe(true);
        expect(prismaMock.habitEntry.create).not.toHaveBeenCalled();
        expect(prismaMock.subvariableEntry.update).not.toHaveBeenCalled();
    });

    it('enforces numeric metadata bounds and rejects impossible dates', async () => {
        prismaMock.habit.findFirst.mockResolvedValue({ id: 'h1', subvariables: [{ id: 's1', type: 'NUMERIC', metadata: '{"min":0,"max":100}' }] });
        const bounded = await toolResult(await call('log_checkin', { habitId: 'h1', subvariableId: 's1', numericValue: 101, logicalDate: '2026-10-06' }));
        expect(bounded.isError).toBe(true);
        const invalidDate = await toolResult(await call('log_checkin', { habitId: 'h1', subvariableId: 's1', numericValue: 10, logicalDate: '2026-02-31' }));
        expect(invalidDate.isError).toBe(true);
        expect(prismaMock.habitEntry.create).not.toHaveBeenCalled();
    });

    it('preserves manual overrides for a value-only edit of an imported entry', async () => {
        prismaMock.habit.findFirst.mockResolvedValue({ id: 'h1', subvariables: [{ id: 's1', type: 'NUMERIC', metadata: '{}' }] });
        prismaMock.experiment.findFirst.mockResolvedValue(null);
        prismaMock.habitEntry.findFirst.mockResolvedValue({ id: 'e1', source: 'apple_health', subvariableEntries: [{ id: 'se1', subvariableId: 's1' }] });
        prismaMock.subvariableEntry.update.mockResolvedValue({ id: 'se1', numericValue: 7, rawValue: null });
        const result = await toolResult(await call('log_checkin', { habitId: 'h1', subvariableId: 's1', numericValue: 7, logicalDate: '2026-10-06' }));
        expect(result.isError).toBeUndefined();
        expect(prismaMock.habitEntry.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { source: null } });
    });

    it('validates arguments with the shared schema', async () => {
        const result = await toolResult(await call('log_checkin', { habitId: 'h1', subvariableId: 's1', numericValue: 'seven', logicalDate: '06/10/2026' }));
        expect(result.isError).toBe(true);
        expect(result.text).toContain('numericValue');
        expect(result.text).toContain('logicalDate');
        const exp = await toolResult(await call('create_experiment', { name: 'x', independentId: 'ckabc123def456ghi789jkl0', dependentId: 'ckabc123def456ghi789jkl0', startDate: '2026-10-01', endDate: '2026-10-03' }));
        expect(exp.isError).toBe(true);
        expect(exp.text).toContain('must be different');
    });

    it('get_experiment_results does not reveal other users\' experiments', async () => {
        prismaMock.experiment.findFirst.mockResolvedValue(null);
        const result = await toolResult(await call('get_experiment_results', { experimentId: 'bobs_exp' }, 'dl_read'));
        expect(result.isError).toBe(true);
        expect(result.text).toBe('Experiment not found');
        expect(prismaMock.experiment.findFirst.mock.calls[0][0].where).toEqual({ id: 'bobs_exp', userId: 'alice' });
    });

    it('get_entries rejects reversed and oversized ranges', async () => {
        expect((await toolResult(await call('get_entries', { startDate: '2026-10-06', endDate: '2026-10-01' }))).isError).toBe(true);
        expect((await toolResult(await call('get_entries', { startDate: '2024-01-01', endDate: '2026-01-01' }))).isError).toBe(true);
    });

    it('hides internal errors', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
        prismaMock.experiment.findMany.mockRejectedValue(new Error('connection to db failed for user bob@example.com at /src/x.ts:1'));
        const result = await toolResult(await call('list_experiments', {}, 'dl_read'));
        expect(result.isError).toBe(true);
        expect(result.text).toBe('Internal error. Please try again later.');
    });
});
