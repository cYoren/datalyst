import { describe, expect, it } from 'vitest';
import {
    FEATURES,
    PLUS_SUMMARY,
    can,
    canWithSelfHosted,
    normalizePlan,
    type Feature,
} from './entitlement';

/**
 * `ROADMAP.md` M1's acceptance: a table of every feature against both plans and self-hosted.
 * The table is written out by hand rather than derived from the implementation — a test that
 * reads its own answer cannot catch a wrong answer.
 */
const EXPECTED: Record<Feature, { free: boolean; plus: boolean }> = {
    'trackers': { free: true, plus: true },
    'check-ins': { free: true, plus: true },
    'widgets': { free: true, plus: true },
    'patterns': { free: true, plus: true },
    'one-experiment-at-a-time': { free: true, plus: true },
    'export': { free: true, plus: true },
    'connected-apps': { free: true, plus: true },
    'self-hosted': { free: true, plus: true },
    'ai-quick-log': { free: false, plus: true },
    'ai-explanations': { free: false, plus: true },
    'health-import': { free: false, plus: true },
    'experiments-in-parallel': { free: false, plus: true },
    'assistant-access-beyond-allowance': { free: false, plus: true },
};

describe('the entitlement table', () => {
    it('covers every feature, so a new one cannot ship ungated by accident', () => {
        expect(Object.keys(EXPECTED).sort()).toEqual([...FEATURES].sort());
    });

    it('answers the same as the written table, for both plans', () => {
        for (const feature of FEATURES) {
            expect(can({ plan: 'free' }, feature), `free / ${feature}`).toBe(EXPECTED[feature].free);
            expect(can({ plan: 'plus' }, feature), `plus / ${feature}`).toBe(EXPECTED[feature].plus);
        }
    });

    it('never takes away something that was free', () => {
        // Written out rather than derived: PLUS_FEATURES is built from FREE_FEATURES, so a
        // `contains` check could never fail. These are the free promises PRODUCT.md makes.
        for (const promise of ['trackers', 'check-ins', 'widgets', 'patterns', 'export', 'connected-apps'] as const) {
            expect(can({ plan: 'free' }, promise), promise).toBe(true);
            expect(can({ plan: 'plus' }, promise), promise).toBe(true);
        }
    });

    it('treats anything unrecognised as Free, so a bad column cannot grant Plus', () => {
        for (const plan of [null, undefined, '', 'PLUS', 'pro', 'trial', 'Plus ']) {
            expect(normalizePlan(plan), String(plan)).toBe('free');
            expect(can({ plan }, 'ai-quick-log'), String(plan)).toBe(false);
        }
        expect(normalizePlan('plus')).toBe('plus');
    });

    it('answers yes to everything on a self-hosted install, including the paid set', () => {
        // `canWithSelfHosted` short-circuits on the flag, so this has to be checked against the
        // features a Free account is *refused* — otherwise the assertion is a tautology.
        for (const feature of FEATURES.filter((candidate) => !EXPECTED[candidate].free)) {
            expect(can({ plan: 'free' }, feature), feature).toBe(false);
            expect(canWithSelfHosted({ plan: 'free' }, feature, true), feature).toBe(true);
        }
    });

    it('still answers as the plan on Cloud', () => {
        expect(canWithSelfHosted({ plan: 'free' }, 'health-import', false)).toBe(false);
        expect(canWithSelfHosted({ plan: 'plus' }, 'health-import', false)).toBe(true);
    });

    it('keeps the gate copy short enough to read on a phone', () => {
        expect(PLUS_SUMMARY).toHaveLength(3);
        for (const line of PLUS_SUMMARY) expect(line.length).toBeLessThan(90);
    });
});
