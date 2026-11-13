import { describe, it, expect } from 'vitest';
import { AI_CAPABILITIES, aiCapabilities, aiCapabilityEnabled } from '../flags';

describe('AI capability flags', () => {
    it('runs the shipped capabilities by default and nothing unshipped', () => {
        const flags = aiCapabilities({});
        expect(flags.insights).toBe(true);
        expect(flags.quick_log).toBe(true);
        // A capability that is not finished must not be reachable by forgetting to configure it.
        expect(flags.protocol_builder).toBe(false);
        expect(flags.experiment_planner).toBe(false);
        expect(flags.next_observation).toBe(false);
    });

    it('turns one capability off without touching the others', () => {
        const flags = aiCapabilities({ AI_FEATURE_INSIGHTS: 'off' });
        expect(flags.insights).toBe(false);
        expect(flags.quick_log).toBe(true);
    });

    it('lets the master switch beat every per-capability value', () => {
        const env = { AI_ENABLED: 'off', AI_FEATURE_QUICK_LOG: 'on', AI_FEATURE_INSIGHTS: 'on' };
        expect(aiCapabilities(env)).toEqual(
            Object.fromEntries(AI_CAPABILITIES.map((capability) => [capability, false])),
        );
    });

    it('reads the obvious spellings and refuses an unreadable one', () => {
        for (const on of ['on', 'ON', '1', 'true', ' yes ']) {
            expect(aiCapabilityEnabled('insights', { AI_FEATURE_INSIGHTS: on })).toBe(true);
        }
        for (const off of ['off', '0', 'false', 'no']) {
            expect(aiCapabilityEnabled('insights', { AI_FEATURE_INSIGHTS: off })).toBe(false);
        }
        // A typo is not permission.
        expect(aiCapabilityEnabled('insights', { AI_FEATURE_INSIGHTS: 'maybe' })).toBe(false);
    });

    it('can switch on a capability that has not shipped, deliberately', () => {
        expect(aiCapabilityEnabled('protocol_builder', { AI_FEATURE_PROTOCOL_BUILDER: 'on' })).toBe(true);
    });
});
