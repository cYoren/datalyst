import { beforeEach, describe, expect, it, vi } from 'vitest';

const reminders = vi.hoisted(() => ({ forgetReminder: vi.fn(async () => {}) }));
vi.mock('./reminders', () => reminders);

import { clearLocalAccountData } from './accountLocalData';

const OWNER = 'user-a';
const OTHER = 'user-b';

const queueRow = (ownerId: string, subvariableId: string) =>
    JSON.stringify([{ habitId: 'h', subvariableId, numericValue: 5, logicalDate: '2026-11-09', ownerId }]);

describe('clearLocalAccountData', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    it('removes the deleted account data and keeps another account on the same browser', async () => {
        window.localStorage.setItem('datalyst-swr-cache', '{"version":2,"owner":"user-a","entries":{}}');
        window.localStorage.setItem('datalyst:pending-checkins-v1', JSON.stringify([
            { habitId: 'h', subvariableId: 'a', numericValue: 1, logicalDate: '2026-11-09', ownerId: OWNER },
            { habitId: 'h', subvariableId: 'b', numericValue: 2, logicalDate: '2026-11-09', ownerId: OTHER },
            // No owner: written by an older build, so it cannot be attributed to anyone.
            { habitId: 'h', subvariableId: 'legacy', numericValue: 3, logicalDate: '2026-11-09' },
        ]));
        window.localStorage.setItem(`datalyst:health-v2:${OWNER}`, '{"metrics":["sleep"]}');
        window.localStorage.setItem(`datalyst:health-v2:${OTHER}`, '{"metrics":["steps"]}');
        window.localStorage.setItem('datalyst:review-prompt-state-v1', '{"weight":3}');
        window.localStorage.setItem('datalyst_insight_celebrated', '1');
        window.localStorage.setItem('datalyst_seen_insight_count', '4');

        await clearLocalAccountData(OWNER);

        expect(window.localStorage.getItem('datalyst-swr-cache')).toBeNull();
        const queue = JSON.parse(window.localStorage.getItem('datalyst:pending-checkins-v1') || '[]') as { subvariableId: string }[];
        expect(queue.map((row) => row.subvariableId).sort()).toEqual(['b', 'legacy']);
        expect(window.localStorage.getItem(`datalyst:health-v2:${OWNER}`)).toBeNull();
        expect(window.localStorage.getItem(`datalyst:health-v2:${OTHER}`)).toBe('{"metrics":["steps"]}');
        expect(window.localStorage.getItem('datalyst:review-prompt-state-v1')).toBeNull();
        expect(window.localStorage.getItem('datalyst_insight_celebrated')).toBeNull();
        expect(window.localStorage.getItem('datalyst_seen_insight_count')).toBeNull();
        expect(reminders.forgetReminder).toHaveBeenCalledOnce();
    });

    it('drops the queue item entirely when it held only that account', async () => {
        window.localStorage.setItem('datalyst:pending-checkins-v1', queueRow(OWNER, 'a'));

        await clearLocalAccountData(OWNER);

        expect(window.localStorage.getItem('datalyst:pending-checkins-v1')).toBeNull();
    });

    it('does nothing without an account, so a missing id cannot wipe another account', async () => {
        window.localStorage.setItem('datalyst:pending-checkins-v1', queueRow(OTHER, 'b'));
        window.localStorage.setItem(`datalyst:health-v2:${OTHER}`, '{"metrics":["steps"]}');

        await clearLocalAccountData(null);
        await clearLocalAccountData(undefined);
        await clearLocalAccountData('');

        expect(window.localStorage.getItem('datalyst:pending-checkins-v1')).not.toBeNull();
        expect(window.localStorage.getItem(`datalyst:health-v2:${OTHER}`)).not.toBeNull();
        expect(reminders.forgetReminder).not.toHaveBeenCalled();
    });
});
