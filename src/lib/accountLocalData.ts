'use client';

import { clearHealthSettingForAccount } from './health';
import { clearPendingCheckIns } from './offlineQueue';
import { clearPersistedCache } from '@/providers/SWRProvider';
import { clearReviewPromptState } from './reviewPrompt';
import { forgetReminder } from './reminders';

/**
 * Best-effort cleanup of this device after the server confirms an account is
 * gone. Runs while the deleted account is still the signed-in one.
 *
 * Account-attributed data is removed for that account only: the offline queue is
 * filtered by owner, and the health-import setting is keyed by owner, so another
 * account that shares this browser keeps its rows. The persisted response cache
 * holds a single owner's responses (the one signing out), and the review-prompt
 * history and insight counters are device-level and hold no health data.
 *
 * What this cannot do: recall data already downloaded, or attribute entries
 * written by builds that did not record an owner.
 */
export async function clearLocalAccountData(accountId: string | null | undefined): Promise<void> {
    if (!accountId || typeof window === 'undefined') return;

    clearPersistedCache();
    clearPendingCheckIns(accountId);
    clearHealthSettingForAccount(accountId);
    clearReviewPromptState();

    // Dashboard-only counters that describe the deleted account's insights.
    try {
        window.localStorage.removeItem('datalyst_insight_celebrated');
        window.localStorage.removeItem('datalyst_seen_insight_count');
    } catch {
        /* best-effort local cleanup */
    }

    await forgetReminder();
}
