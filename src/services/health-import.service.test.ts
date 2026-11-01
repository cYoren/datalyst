// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ prisma: { $transaction: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: mock.prisma }));
import { disconnectHealthImport, importHealthBatch } from './health-import.service';

type Row = { id: string; logicalDate: Date; source: string | null; value: number };
let rows: Row[];
let active: boolean;
let consent: boolean;
let beforeCreate: (() => Promise<void>) | undefined;
let beforeEntryLock: (() => void) | undefined;
let lockTail: Promise<void>;
let events: string[];
const date = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
const batch = { connectionId: 'device-a', source: 'apple_health' as const, metrics: ['steps'], from: date, until: tomorrow, samples: [{ key: 'steps', date, value: 500 }] };

function transaction() {
    let unlock: (() => void) | undefined;
    const tx = {
        $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join('?');
            if (sql.includes('FROM "User"')) {
                expect(values[0]).toBeDefined();
                const previous = lockTail;
                lockTail = new Promise<void>(resolve => { unlock = resolve; });
                await previous;
                events.push('owner-lock');
                return [{ id: values[0] }];
            }
            expect(sql).toContain('FOR UPDATE');
            beforeEntryLock?.();
            return rows.map(r => ({ id: r.id }));
        }),
        healthImportConnection: {
            findFirst: vi.fn(async ({ where }) => where.id === 'device-a' && where.userId === 'alice' && (where.active === undefined || active) ? { id: 'device-a' } : null),
            updateMany: vi.fn(async () => { active = false; events.push('revoke'); return { count: 1 }; }),
        },
        user: { findUnique: vi.fn(async () => ({ healthDataConsent: consent })) },
        habit: {
            findMany: vi.fn(async () => [{ id: 'steps', healthMetric: 'steps', archived: false, subvariables: [{ id: 'step-count', healthKey: 'steps' }] }]),
            create: vi.fn(), deleteMany: vi.fn(async () => ({ count: 0 })),
        },
        habitEntry: {
            findMany: vi.fn(async () => rows),
            create: vi.fn(async ({ data }) => {
                await beforeCreate?.();
                rows.push({ id: 'entry', logicalDate: data.logicalDate, source: data.source, value: data.subvariableEntries.create[0].numericValue });
                events.push('create');
            }),
            deleteMany: vi.fn(async () => { const count = rows.filter(r => r.source !== null).length; rows = rows.filter(r => r.source === null); events.push('delete'); return { count }; }),
        },
        subvariableEntry: {
            deleteMany: vi.fn(async () => ({ count: 0 })),
            upsert: vi.fn(async ({ where, update }) => { rows.find(r => r.id === where.habitEntryId_subvariableId.habitEntryId)!.value = update.numericValue; }),
        },
    };
    return { tx, release: () => unlock?.() };
}
beforeEach(() => {
    rows = []; active = true; consent = true; beforeCreate = undefined; beforeEntryLock = undefined; lockTail = Promise.resolve(); events = [];
    mock.prisma.$transaction.mockImplementation(async fn => {
        const { tx, release } = transaction();
        try { return await fn(tx); } finally { release(); }
    });
});

describe('Account-bound health import', () => {
    it('rejects another account or withdrawn consent before data writes', async () => {
        await expect(importHealthBatch('bob', batch)).rejects.toThrow('another account');
        consent = false;
        await expect(importHealthBatch('alice', batch)).rejects.toThrow('consent');
        expect(rows).toEqual([]);
    });
    it('replaces imported days without duplicating on retry', async () => {
        expect((await importHealthBatch('alice', batch)).created).toBe(1);
        expect((await importHealthBatch('alice', { ...batch, samples: [{ key: 'steps', date, value: 700 }] })).updated).toBe(1);
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe(700);
    });
    it('re-reads manual edits after acquiring entry locks', async () => {
        rows = [{ id: 'entry', logicalDate: new Date(`${date}T00:00:00Z`), source: 'apple_health', value: 500 }];
        beforeEntryLock = () => { rows[0].source = null; rows[0].value = 999; };
        expect((await importHealthBatch('alice', batch)).skippedManual).toBe(1);
        expect(rows[0].value).toBe(999);
    });
    it('disconnect revokes future imports even when data is retained', async () => {
        await importHealthBatch('alice', batch);
        await disconnectHealthImport('alice', 'device-a', false);
        await expect(importHealthBatch('alice', batch)).rejects.toThrow('disconnected');
        expect(rows).toHaveLength(1);
    });
    it('serializes deletion behind an in-flight import, then rejects stale retries', async () => {
        let releaseCreate!: () => void;
        let enteredCreate!: () => void;
        const entered = new Promise<void>(resolve => { enteredCreate = resolve; });
        beforeCreate = async () => { enteredCreate(); await new Promise<void>(resolve => { releaseCreate = resolve; }); };
        const importing = importHealthBatch('alice', batch);
        await entered;
        let deleted = false;
        const deleting = disconnectHealthImport('alice', 'device-a', true).then(() => { deleted = true; });
        await Promise.resolve();
        expect(deleted).toBe(false);
        releaseCreate();
        await Promise.all([importing, deleting]);
        expect(events.indexOf('create')).toBeLessThan(events.indexOf('delete'));
        expect(rows).toHaveLength(0);
        await expect(importHealthBatch('alice', batch)).rejects.toThrow('disconnected');
    });
});
