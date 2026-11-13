// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
    apiKey: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    subvariable: { findFirst: vi.fn() },
    experiment: { findFirst: vi.fn() },
}));
const userMock = vi.hoisted(() => ({ current: { id: 'alice' } as { id: string } | null }));
const quickEntryMock = vi.hoisted(() => vi.fn());
const todayMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/ensure-user', () => ({ getAuthenticatedUser: async () => userMock.current }));
vi.mock('@/services/entry.service', () => ({ EntryService: { quickEntry: quickEntryMock } }));
vi.mock('@/services/today.service', () => ({ getTodayLog: todayMock }));

import { createHash } from 'crypto';
import { POST as issueToken } from './token/route';
import { POST as logFromWidget } from './log/route';

const issue = () => issueToken();
const log = (body: unknown, token: string | null = 'dl_widget') =>
    logFromWidget(new Request('http://localhost/api/widget/log', {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body: JSON.stringify(body),
    }));

/** The widget's own day, so the write window never makes a test time-dependent. */
const TODAY = new Date().toISOString().slice(0, 10);
const BOOLEAN = { habitId: 'h1', subvariableId: 's1', date: TODAY };

/** The key row a bearer token hashes to. `id` isolates the rate-limit bucket. */
function keyRow(scopes: string[], id = 'k1') {
    prismaMock.apiKey.findUnique.mockResolvedValue({
        id, name: 'Home screen widget', agentId: null, userId: 'alice',
        isActive: true, revokedAt: null, scopes, rateLimitPerMinute: 20,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    userMock.current = { id: 'alice' };
    prismaMock.apiKey.create.mockResolvedValue({ id: 'k1' });
    prismaMock.apiKey.findMany.mockResolvedValue([]);
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.apiKey.update.mockResolvedValue({});
    prismaMock.subvariable.findFirst.mockResolvedValue({
        type: 'BOOLEAN',
        habit: { scheduleType: 'DAILY', scheduleDays: [], user: { timezone: 'UTC' } },
    });
    prismaMock.experiment.findFirst.mockResolvedValue(null);
    quickEntryMock.mockResolvedValue({ entry: { id: 'e1' }, created: true });
    todayMock.mockResolvedValue({
        date: TODAY,
        logged: 1,
        total: 2,
        variables: [
            { id: 's1', name: 'Sleep', habitId: 'h1', type: 'BOOLEAN', todayEntry: { entryId: 'e1' } },
            { id: 's2', name: 'Mood', habitId: 'h2', type: 'SCALE_0_10', todayEntry: null },
        ],
    });
});

describe('widget device key', () => {
    it('requires a session and never accepts an API key', async () => {
        userMock.current = null;
        expect((await issue()).status).toBe(401);
    });

    it('stores only the hash and keeps one key per install', async () => {
        const res = await issue();
        expect(res.status).toBe(201);
        const { token } = await res.json();

        expect(prismaMock.apiKey.findMany.mock.calls[0][0]).toMatchObject({
            where: { userId: 'alice', scopes: { has: 'widget:log' }, isActive: true },
        });
        // Under the cap nothing is revoked, so a second device does not break the first.
        expect(prismaMock.apiKey.updateMany).not.toHaveBeenCalled();

        const data = prismaMock.apiKey.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ userId: 'alice', scopes: ['widget:log'], name: 'Home screen widget' });
        expect(data.keyHash).toBe(createHash('sha256').update(token).digest('hex'));
        expect(JSON.stringify(data)).not.toContain(token);
    });

    it('retires the oldest key once the cap is reached', async () => {
        prismaMock.apiKey.findMany.mockResolvedValue([{ id: 'old1' }, { id: 'old2' }, { id: 'k3' }, { id: 'k4' }, { id: 'k5' }]);
        await issue();
        expect(prismaMock.apiKey.updateMany.mock.calls[0][0]).toEqual({
            where: { id: { in: ['old1'] } },
            data: { isActive: false, revokedAt: expect.any(Date) },
        });
    });
});

describe('logging from the widget', () => {
    it('rejects a missing or wrongly scoped key', async () => {
        expect((await log(BOOLEAN, null)).status).toBe(401);

        keyRow(['read', 'write']);
        expect((await log(BOOLEAN)).status).toBe(401);
        expect(quickEntryMock).not.toHaveBeenCalled();
    });

    it("logs a yes and answers with the new day's state", async () => {
        keyRow(['widget:log']);
        const res = await log(BOOLEAN);
        expect(res.status).toBe(200);

        expect(quickEntryMock).toHaveBeenCalledWith('alice', {
            habitId: 'h1', subvariableId: 's1', numericValue: 1, logicalDate: TODAY,
        });
        const body = await res.json();
        // The answered next check-in is the one the widget should now offer.
        expect(body).toMatchObject({ logged: 1, total: 2, next: { name: 'Mood', subvariableId: 's2', canLog: false } });
    });

    it('only writes yes/no variables of the key owner', async () => {
        keyRow(['widget:log']);

        prismaMock.subvariable.findFirst.mockResolvedValue(null);
        expect((await log(BOOLEAN)).status).toBe(404);

        // The ownership filter is in the query, not in the caller.
        expect(prismaMock.subvariable.findFirst.mock.calls[0][0].where).toMatchObject({
            id: 's1', habitId: 'h1', habit: { userId: 'alice', archived: false },
        });

        prismaMock.subvariable.findFirst.mockResolvedValue({ type: 'SCALE_0_10' });
        expect((await log(BOOLEAN)).status).toBe(400);
        expect(quickEntryMock).not.toHaveBeenCalled();
    });

    it('validates the body', async () => {
        keyRow(['widget:log']);
        expect((await log({ habitId: 'h1' })).status).toBe(400);
        expect((await log({ ...BOOLEAN, date: '10/11/2026' })).status).toBe(400);
    });

    it('refuses a day the widget cannot be showing', async () => {
        keyRow(['widget:log']);
        const shift = (days: number) => {
            const d = new Date();
            d.setUTCDate(d.getUTCDate() + days);
            return d.toISOString().slice(0, 10);
        };
        // A stale widget, a clock change, or a leaked key backfilling history.
        expect((await log({ ...BOOLEAN, date: shift(-1) })).status).toBe(400);
        expect((await log({ ...BOOLEAN, date: shift(1) })).status).toBe(400);
        expect((await log({ ...BOOLEAN, date: shift(-30) })).status).toBe(400);
        expect(quickEntryMock).not.toHaveBeenCalled();
    });

    it('writes the day the user is actually on, not the server\'s day', async () => {
        keyRow(['widget:log']);
        // 01:00 UTC is still the previous day in Sao Paulo; the widget shows that day.
        const now = new Date();
        const saoPaulo = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(now);
        prismaMock.subvariable.findFirst.mockResolvedValue({
            type: 'BOOLEAN',
            habit: { scheduleType: 'DAILY', scheduleDays: [], user: { timezone: 'America/Sao_Paulo' } },
        });
        expect((await log({ ...BOOLEAN, date: saoPaulo })).status).toBe(200);
    });

    it('only writes a check-in that is scheduled for that day', async () => {
        keyRow(['widget:log']);

        prismaMock.subvariable.findFirst.mockResolvedValue({
            type: 'BOOLEAN',
            habit: { scheduleType: 'ADHOC', scheduleDays: [], user: { timezone: 'UTC' } },
        });
        expect((await log(BOOLEAN)).status).toBe(400);

        // A weekly tracker whose day is not today. Pick a weekday the fixture date is not on.
        const weekday = new Date(`${TODAY}T00:00:00Z`).getUTCDay();
        prismaMock.subvariable.findFirst.mockResolvedValue({
            type: 'BOOLEAN',
            habit: { scheduleType: 'WEEKLY', scheduleDays: [(weekday + 3) % 7], user: { timezone: 'UTC' } },
        });
        expect((await log(BOOLEAN)).status).toBe(400);
        expect(quickEntryMock).not.toHaveBeenCalled();

        // The same tracker on its own day is fine.
        prismaMock.subvariable.findFirst.mockResolvedValue({
            type: 'BOOLEAN',
            habit: { scheduleType: 'WEEKLY', scheduleDays: [weekday], user: { timezone: 'UTC' } },
        });
        expect((await log(BOOLEAN)).status).toBe(200);
    });

    it("never writes the check-in an active experiment controls", async () => {
        keyRow(['widget:log']);
        prismaMock.experiment.findFirst.mockResolvedValue({ independentId: 'h1' });

        expect((await log(BOOLEAN)).status).toBe(400);
        expect(quickEntryMock).not.toHaveBeenCalled();
        // Same date bounds as quickEntry: an experiment that ended must not block a tap.
        expect(prismaMock.experiment.findFirst.mock.calls[0][0].where).toMatchObject({
            userId: 'alice', status: 'ACTIVE', startDate: { lte: TODAY }, endDate: { gte: TODAY },
        });

        // Another habit is still fine; only the assigned one is off limits.
        prismaMock.experiment.findFirst.mockResolvedValue({ independentId: 'h2' });
        expect((await log(BOOLEAN)).status).toBe(200);
    });

    it('rate limits per key', async () => {
        // A fresh key id, because the buckets are process-wide and the tests above spent theirs.
        keyRow(['widget:log'], 'k-rate');
        // The key stores 20/min; the 21st tap in the same minute is refused without a write.
        for (let i = 0; i < 20; i += 1) expect((await log(BOOLEAN)).status).toBe(200);
        const blocked = await log(BOOLEAN);
        expect(blocked.status).toBe(429);
        expect(blocked.headers.get('Retry-After')).toBeTruthy();
        expect(quickEntryMock).toHaveBeenCalledTimes(20);
    });
});
