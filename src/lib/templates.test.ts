import { describe, expect, it } from 'vitest';
import { HABIT_TEMPLATES, PROTOCOL_BUNDLES } from './templates';
import { HEALTH_METRICS } from './health-metrics';
import { TRACKER_ICONS, resolveTrackerIcon } from '@/components/ui/TrackerIcon';

describe('templates', () => {
    it('has unique template ids', () => {
        const ids = HABIT_TEMPLATES.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it('every bundle points at real templates', () => {
        const ids = new Set(HABIT_TEMPLATES.map(t => t.id));
        for (const b of PROTOCOL_BUNDLES) for (const id of b.protocolIds) expect(ids.has(id), `${b.id} → ${id}`).toBe(true);
    });
    it('every onboarding focus area has at least one bundle', () => {
        for (const area of ['Symptoms', 'Physical Health', 'Mental Wellness', 'Productivity', 'Learning', 'Finance', 'Habits & Life']) {
            expect(PROTOCOL_BUNDLES.some(b => b.focusAreas.includes(area)), area).toBe(true);
        }
    });
    it('uses real icon keys, never emojis', () => {
        const used = [...HABIT_TEMPLATES, ...PROTOCOL_BUNDLES, ...HEALTH_METRICS].map(t => t.icon);
        for (const icon of used) expect(TRACKER_ICONS[icon], icon).toBeDefined();
    });
    it('still renders emojis saved by older versions', () => {
        expect(resolveTrackerIcon('😴')).toBe(TRACKER_ICONS.moon);
        expect(resolveTrackerIcon('unknown')).toBe(TRACKER_ICONS.target);
    });
});
