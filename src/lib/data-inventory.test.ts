import { describe, expect, it, vi } from 'vitest';
import { INVENTORY_PROMISE, POLICY_LINKS, dataInventory } from './data-inventory';

describe('the data inventory in Settings', () => {
    it('names every kind of thing we hold, including the ones people forget', () => {
        const names = dataInventory().map((thing) => thing.name.toLowerCase()).join(' | ');
        // Everything we actually hold, including the rows a person would not think of.
        for (const expected of ['account', 'trackers', 'experiments', 'ai', 'keys', 'usage', 'health', 'study']) {
            expect(names, expected).toContain(expected);
        }
    });

    it('gives every row a window, a reason and a place to act on it', () => {
        for (const thing of dataInventory()) {
            expect(thing.what.length, thing.name).toBeGreaterThan(10);
            expect(thing.why.length, thing.name).toBeGreaterThan(10);
            expect(thing.where.length, thing.name).toBeGreaterThan(3);
            expect(thing.retentionDays === null || thing.retentionDays > 0, thing.name).toBe(true);
        }
    });

    it('takes its windows from the purge job, not from literals in the page', async () => {
        // A row that hard-codes 365 would agree with the job today and drift tomorrow. The env
        // vars are what the job reads, so changing them must change the page.
        vi.resetModules();
        vi.stubEnv('RETENTION_USER_EVENT_DAYS', '7');
        vi.stubEnv('RETENTION_INSIGHTS_DAYS', '3');
        const fresh = await import('./data-inventory');
        const byName = new Map(fresh.dataInventory().map((thing) => [thing.name, thing]));

        expect(byName.get('Usage events')?.retentionDays).toBe(7);
        expect(byName.get('AI answers already generated')?.retentionDays).toBe(3);
        vi.unstubAllEnvs();
    });

    it('says a person’s own history is kept until they delete it', () => {
        const own = dataInventory().filter((thing) => ['Your account', 'Your trackers and check-ins', 'Your experiments'].includes(thing.name));
        expect(own).toHaveLength(3);
        for (const thing of own) expect(thing.retentionDays, thing.name).toBeNull();
    });

    it('keeps the promise to one sentence and the policies reachable', () => {
        expect(INVENTORY_PROMISE.split('. ').length).toBeLessThanOrEqual(3);
        expect(POLICY_LINKS.map((link) => link.href)).toEqual(['/privacy', '/terms', '/cookies']);
    });
});
