import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
    clearReviewPromptState,
    PROMPT_COOLDOWN_MS,
    recordCheckIn,
    recordPositiveMoment,
    reviewPromptTestUtils,
    suppressReviewPrompts,
} from './reviewPrompt';

describe('review prompt gate', () => {
    let requestReview: Mock<() => Promise<void>>;

    beforeEach(() => {
        window.localStorage.clear();
        reviewPromptTestUtils.reset();
        requestReview = vi.fn(async () => {});
        reviewPromptTestUtils.reviewApi = { requestReview };
        reviewPromptTestUtils.isNative = () => true;
    });

    afterEach(() => {
        reviewPromptTestUtils.reset();
        window.localStorage.clear();
    });

    it('asks on a single peak moment', async () => {
        await expect(recordPositiveMoment('peak')).resolves.toBe(true);
        expect(requestReview).toHaveBeenCalledTimes(1);
    });

    it('makes routine moments stack up before the first ask', async () => {
        await expect(recordPositiveMoment('routine')).resolves.toBe(false);
        await expect(recordPositiveMoment('routine')).resolves.toBe(false);
        expect(requestReview).not.toHaveBeenCalled();

        await expect(recordPositiveMoment('routine')).resolves.toBe(true);
        expect(requestReview).toHaveBeenCalledTimes(1);
    });

    it('never asks on the web, where there is no store', async () => {
        reviewPromptTestUtils.isNative = () => false;
        await expect(recordPositiveMoment('peak')).resolves.toBe(false);
        expect(requestReview).not.toHaveBeenCalled();
    });

    it('respects suppression after negative feedback', async () => {
        suppressReviewPrompts();
        await expect(recordPositiveMoment('peak')).resolves.toBe(false);
        expect(requestReview).not.toHaveBeenCalled();
    });

    it('refuses a second ask inside the cooldown', async () => {
        await expect(recordPositiveMoment('peak')).resolves.toBe(true);
        await expect(recordPositiveMoment('peak')).resolves.toBe(false);
        expect(requestReview).toHaveBeenCalledTimes(1);
    });

    it('asks again once the cooldown has passed, needing fresh evidence', async () => {
        const start = Date.now();
        reviewPromptTestUtils.now = () => start;
        await expect(recordPositiveMoment('peak')).resolves.toBe(true);

        reviewPromptTestUtils.now = () => start + PROMPT_COOLDOWN_MS + 1;
        // The credit that earned the first prompt is spent, so one routine
        // moment alone must not be enough.
        await expect(recordPositiveMoment('routine')).resolves.toBe(false);
        expect(requestReview).toHaveBeenCalledTimes(1);

        await expect(recordPositiveMoment('peak')).resolves.toBe(true);
        expect(requestReview).toHaveBeenCalledTimes(2);
    });

    it('credits a completed day only once however often it is recomputed', async () => {
        // The dashboard summary revalidates on focus and on a 60s timer, so the
        // same completed day arrives repeatedly.
        for (let i = 0; i < 5; i++) {
            await recordCheckIn({ dayComplete: true, logicalDate: '2026-08-26' });
        }
        expect(requestReview).toHaveBeenCalledTimes(1);

        // A genuinely new day still counts.
        reviewPromptTestUtils.now = () => Date.now() + PROMPT_COOLDOWN_MS + 1;
        await recordCheckIn({ dayComplete: true, logicalDate: '2026-08-27' });
        expect(requestReview).toHaveBeenCalledTimes(2);
    });

    it('treats a partial day as a routine moment, not a peak one', async () => {
        await recordCheckIn({ dayComplete: false, logicalDate: '2026-08-26' });
        expect(requestReview).not.toHaveBeenCalled();
    });

    it('never throws when the store API fails', async () => {
        reviewPromptTestUtils.reviewApi = {
            requestReview: async () => {
                throw new Error('no store on this device');
            },
        };
        await expect(recordPositiveMoment('peak')).resolves.toBe(false);
    });
});

describe('clearReviewPromptState', () => {
    beforeEach(() => window.localStorage.clear());

    it('forgets the local history so a new account on this device starts fresh', () => {
        window.localStorage.setItem('datalyst:review-prompt-state-v1', JSON.stringify({ weight: 5, last: '2026-11-01' }));
        clearReviewPromptState();
        expect(window.localStorage.getItem('datalyst:review-prompt-state-v1')).toBeNull();
    });

    it('is safe when storage throws', () => {
        const removeItem = window.localStorage.removeItem;
        window.localStorage.removeItem = () => { throw new Error('blocked'); };
        expect(() => clearReviewPromptState()).not.toThrow();
        window.localStorage.removeItem = removeItem;
    });
});

