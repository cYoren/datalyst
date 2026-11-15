// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The write half of `/api/v1/app/values`: what an app may not do.
 * The happy path (write, read back, hand edit, refused overwrite, disconnect) is the
 * integration walk `docs/CONNECTED-APPS.md` asks for.
 */

const mocks = vi.hoisted(() => ({
    authenticateAppKey: vi.fn(),
    upsert: vi.fn(),
    event: vi.fn(),
    habitFindMany: vi.fn(),
    habitFindFirst: vi.fn(),
    entryFindFirst: vi.fn(),
    entryFindMany: vi.fn(),
    subEntryDelete: vi.fn(),
    subEntryFindMany: vi.fn(),
    quickEntry: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        apiKeyUsage: { upsert: mocks.upsert },
        apiKeyEvent: { create: mocks.event },
        habit: { findMany: mocks.habitFindMany, findFirst: mocks.habitFindFirst },
        habitEntry: { findFirst: mocks.entryFindFirst, findMany: mocks.entryFindMany },
        subvariableEntry: { delete: mocks.subEntryDelete, findMany: mocks.subEntryFindMany },
        // The write ceiling is the person's own day, so the route reads their time zone.
        user: { findUnique: async () => ({ timezone: 'UTC' }) },
    },
}));
vi.mock('@/lib/agent-auth', () => ({ authenticateAppKey: mocks.authenticateAppKey }));
vi.mock('@/services/entry.service', () => ({ EntryService: { quickEntry: mocks.quickEntry } }));

import { DELETE, GET, PUT } from './route';
import { ServiceError } from '@/lib/error-utils';

const agent = {
    apiKeyId: 'key-1',
    userId: 'user-1',
    agentName: 'Advanced Dual N-Back',
    scopes: ['app:read', 'app:write'],
    rateLimitPerMinute: 60,
    appId: 'advanced-dual-n-back',
    readableSubvariableIds: [],
};

const today = new Date().toISOString().slice(0, 10);

const put = (body: unknown) =>
    PUT(new Request('http://localhost/api/v1/app/values', {
        method: 'PUT',
        headers: { authorization: 'Bearer dl_x', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAppKey.mockResolvedValue(agent);
    mocks.upsert.mockResolvedValue({ count: 1 });
    mocks.event.mockResolvedValue({});
    mocks.quickEntry.mockResolvedValue({ created: true });
    mocks.habitFindMany.mockResolvedValue([
        {
            id: 'tracker-1',
            name: 'Working memory (Advanced Dual N-Back)',
            subvariables: [
                { id: 'var-dprime', name: 'Sensitivity', type: 'NUMERIC', metadata: '{}' },
                { id: 'var-level', name: 'Level', type: 'NUMERIC', metadata: '{}' },
            ],
        },
    ]);
});

describe('PUT /api/v1/app/values', () => {
    it('refuses a key that is not an app key', async () => {
        mocks.authenticateAppKey.mockResolvedValue(null);
        expect((await put([{ date: today, variableKey: 'dprime', value: 2.4 }])).status).toBe(401);
        expect(mocks.quickEntry).not.toHaveBeenCalled();
    });

    it('writes through the service, so the ownership rule cannot be skipped', async () => {
        const response = await put([{ date: today, variableKey: 'dprime', value: 2.4 }]);
        expect(response.status).toBe(200);
        expect(mocks.quickEntry).toHaveBeenCalledWith(
            'user-1',
            { habitId: 'tracker-1', subvariableId: 'var-dprime', numericValue: 2.4, logicalDate: today },
            { appId: 'advanced-dual-n-back' },
        );
        expect(await response.json()).toMatchObject({ written: [{ date: today, variableKey: 'dprime', variableId: 'var-dprime' }] });
    });

    it('reports a hand-edited value as refused, and writes the rest of the batch', async () => {
        // One manual fix must not stop the app's whole sync.
        mocks.quickEntry
            .mockRejectedValueOnce(new ServiceError('This value was edited by hand', 409))
            .mockResolvedValueOnce({ created: true, entry: { habitEntryId: 'e', subvariableEntryId: 's', numericValue: 3, rawValue: '3' } });

        const response = await put([
            { date: today, variableKey: 'dprime', value: 2.4 },
            { date: today, variableKey: 'level', value: 3 },
        ]);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.written).toEqual([expect.objectContaining({ variableKey: 'level' })]);
        expect(body.refused).toEqual([expect.objectContaining({ variableKey: 'dprime', reason: 'hand_edited' })]);
    });

    it('turns any other service refusal into the status it chose', async () => {
        mocks.quickEntry.mockRejectedValue(new ServiceError('That tracker is not the app\'s', 403));
        const response = await put([{ date: today, variableKey: 'dprime', value: 2.4 }]);
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { code: 'write_refused' } });
        expect(mocks.event).not.toHaveBeenCalled();
    });

    it('never reports a write as written when the service wrote nothing', async () => {
        mocks.quickEntry.mockResolvedValue(null);
        const response = await put([{ date: today, variableKey: 'dprime', value: 2.4 }]);
        expect(response.status).toBe(404);
        expect(mocks.event).not.toHaveBeenCalled();
    });

    it('refuses a date more than 30 days back, or in the future', async () => {
        const old = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
        const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        expect((await put([{ date: old, variableKey: 'dprime', value: 1 }])).status).toBe(400);
        expect((await put([{ date: future, variableKey: 'dprime', value: 1 }])).status).toBe(400);
        expect(mocks.quickEntry).not.toHaveBeenCalled();
    });

    it('refuses a variable the app does not declare, and a value the variable cannot hold', async () => {
        expect((await put([{ date: today, variableKey: 'mood', value: 1 }])).status).toBe(404);
        mocks.habitFindMany.mockResolvedValue([
            {
                id: 'tracker-1',
                name: 'Working memory (Advanced Dual N-Back)',
                subvariables: [{ id: 'var-level', name: 'Level', type: 'SCALE_0_10', metadata: '{}' }],
            },
        ]);
        // The app's own registry says Level is NUMERIC; a scale check only runs on the stored type.
        expect((await put([{ date: today, variableKey: 'level', value: 11 }])).status).toBe(400);
        expect(mocks.quickEntry).not.toHaveBeenCalled();
    });

    it('refuses more than fifty values in one request, and an empty body', async () => {
        const many = Array.from({ length: 51 }, () => ({ date: today, variableKey: 'dprime', value: 1 }));
        expect((await put(many)).status).toBe(400);
        expect((await put([])).status).toBe(400);
        expect((await put({ nope: true })).status).toBe(400);
    });

    it('records what it wrote, without the value', async () => {
        await put([{ date: today, variableKey: 'dprime', value: 2.4 }]);
        const logged = mocks.event.mock.calls[0][0].data;
        expect(logged).toMatchObject({ apiKeyId: 'key-1', appId: 'advanced-dual-n-back', action: 'write', habitId: 'tracker-1' });
        expect(JSON.stringify(logged)).not.toContain('2.4');
    });
});

describe('DELETE /api/v1/app/values', () => {
    const del = (body: unknown) =>
        DELETE(new Request('http://localhost/api/v1/app/values', {
            method: 'DELETE',
            headers: { authorization: 'Bearer dl_x', 'content-type': 'application/json' },
            body: JSON.stringify(body),
        }));

    it('removes a value the app wrote', async () => {
        mocks.habitFindFirst.mockResolvedValue({ id: 'tracker-1', subvariables: [{ id: 'var-dprime' }] });
        mocks.entryFindMany.mockResolvedValue([{ id: 'entry-1', source: 'app:advanced-dual-n-back', logicalDate: new Date(`${today}T00:00:00Z`), subvariableEntries: [{ id: 'sub-1' }] }]);

        const response = await del({ date: today, variableKey: 'dprime' });
        expect(response.status).toBe(200);
        expect(mocks.subEntryDelete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    });

    it('refuses a value the person edited by hand', async () => {
        mocks.habitFindFirst.mockResolvedValue({ id: 'tracker-1', subvariables: [{ id: 'var-dprime' }] });
        mocks.entryFindMany.mockResolvedValue([{ id: 'entry-1', source: null, logicalDate: new Date(`${today}T00:00:00Z`), subvariableEntries: [{ id: 'sub-1' }] }]);

        const response = await del({ date: today, variableKey: 'dprime' });
        expect(response.status).toBe(409);
        expect(mocks.subEntryDelete).not.toHaveBeenCalled();
    });

    it('says plainly when there is nothing to remove', async () => {
        mocks.habitFindFirst.mockResolvedValue({ id: 'tracker-1', subvariables: [{ id: 'var-dprime' }] });
        mocks.entryFindMany.mockResolvedValue([]);
        expect((await del({ date: today, variableKey: 'dprime' })).status).toBe(404);
    });
});

describe('GET /api/v1/app/values', () => {
    const get = (query: string) =>
        GET(new Request(`http://localhost/api/v1/app/values?${query}`, { headers: { authorization: 'Bearer dl_x' } }));

    beforeEach(() => { mocks.subEntryFindMany.mockResolvedValue([]); });

    it('reads back what it wrote, on the trackers it created, with nothing ticked', async () => {
        // The integration walk writes a value and reads it back; the person ticked none of the
        // app's variables, because the connect screen only lists their own (`ROADMAP.md` S1).
        const response = await get(`from=${today}&to=${today}`);
        expect(response.status).toBe(200);
        // The app's own variables reach the query even though `readableSubvariableIds` is empty.
        const where = mocks.subEntryFindMany.mock.calls[0][0].where;
        expect(where.subvariableId.in).toEqual(expect.arrayContaining(['var-dprime', 'var-level']));
    });

    it('never reads a person variable that was not ticked', async () => {
        await get(`from=${today}&to=${today}`);
        const where = mocks.subEntryFindMany.mock.calls[0][0].where;
        expect(where.subvariableId.in).not.toContain('var-someone-elses');
    });
});
