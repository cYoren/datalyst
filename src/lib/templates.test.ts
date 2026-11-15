import { describe, expect, it } from 'vitest';
import {
    HABIT_TEMPLATES,
    MAX_START_QUESTIONS,
    PROTOCOL_BUNDLES,
    getTemplateById,
    moreQuestionsFor,
    startQuestionsForBundle,
    startSubvariablesFor,
    startTrackerCount,
    startTrackersForBundles,
    templateForHabit,
} from './templates';
import { MAX_START_TRACKERS } from './templates';
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

describe('the first day', () => {
    it('never asks more than five questions, whatever the pack', () => {
        for (const bundle of PROTOCOL_BUNDLES) {
            const start = startQuestionsForBundle(bundle);
            expect(start.length, bundle.id).toBeLessThanOrEqual(MAX_START_QUESTIONS);
            expect(start.length, bundle.id).toBeGreaterThan(0);
        }
    });

    it('starts with the symptom, then one question from each trigger', () => {
        const gut = PROTOCOL_BUNDLES.find(b => b.id === 'gut-triggers')!;
        const start = startQuestionsForBundle(gut);
        const firstTemplate = getTemplateById(gut.protocolIds[0])!;
        expect(start[0]).toEqual({ templateId: gut.protocolIds[0], subvariable: firstTemplate.subvariables[0].name });
        // the old pack asked ten questions; this one asks one per tracker
        expect(start).toHaveLength(gut.protocolIds.length);
    });

    it('keeps only the chosen question when the tracker is created', () => {
        const gut = PROTOCOL_BUNDLES.find(b => b.id === 'gut-triggers')!;
        const subs = startSubvariablesFor('gut', gut);
        expect(subs).toHaveLength(1);
        expect(subs[0].name).toBe(getTemplateById('gut')!.subvariables[0].name);
    });

    it('caps the day-one set per person, not per pack', () => {
        // Every pack in a focus area selected at once used to mean 13–14 trackers.
        const everyPack = PROTOCOL_BUNDLES.filter((bundle) => bundle.focusAreas.includes('Habits & Life'));
        expect(everyPack.length).toBeGreaterThan(1);
        expect(startTrackerCount(everyPack)).toBeLessThanOrEqual(MAX_START_TRACKERS);
        expect(startTrackersForBundles(everyPack)).toHaveLength(MAX_START_TRACKERS);
        // One question each, and no tracker appears twice when packs overlap.
        const ids = startTrackersForBundles(everyPack).map((tracker) => tracker.templateId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('keeps day one small even when a bundle runs out of question budget', () => {
        // Six protocols against a five-question cap: the last tracker must still get one
        // question, not all of its own.
        const wide = { ...PROTOCOL_BUNDLES[0], protocolIds: ['gut', 'sleep', 'stress', 'mood', 'caffeine', 'exercise'] };
        const start = startQuestionsForBundle(wide);
        expect(start).toHaveLength(MAX_START_QUESTIONS);
        const last = wide.protocolIds[start.length];
        expect(startSubvariablesFor(last, wide)).toEqual([]);
        const fallback = [getTemplateById(last)!.subvariables[0]];

        // What onboarding would create for that tracker.
        const created = (startSubvariablesFor(last, wide).length > 0 ? startSubvariablesFor(last, wide) : fallback)
            .filter(Boolean)
            .slice(0, MAX_START_QUESTIONS);
        expect(created).toHaveLength(1);
    });

    it('matches a tracker to its template by origin, and not by a name it never shared', () => {
        const sleep = getTemplateById('sleep')!;
        // Renamed, but created from the template: still its own questions.
        expect(templateForHabit({ id: 'h', name: 'My sleep', templateOrigin: 'sleep', subvariables: [] })?.id).toBe('sleep');
        // The health import's tracker is also called "Sleep" but shares none of the questions.
        expect(
            templateForHabit({
                id: 'h',
                name: sleep.name,
                subvariables: [{ name: 'Sleep duration' }, { name: 'Deep sleep' }, { name: 'REM sleep' }],
            }),
        ).toBeUndefined();
        // Same name, one shared question: an old tracker, before templateOrigin existed.
        expect(templateForHabit({ id: 'h', name: sleep.name, subvariables: [{ name: 'Hours' }] })?.id).toBe('sleep');
    });

    it('offers the questions a tracker skipped, from its own template', () => {
        const template = getTemplateById('gut')!;
        const [first] = template.subvariables;
        const more = moreQuestionsFor([{ id: 'h1', name: template.name, subvariables: [{ name: first.name }] }]);
        expect(more).toHaveLength(1);
        expect(more[0].missing).toEqual(template.subvariables.slice(1).map(s => s.name));
    });

    it('says nothing about a tracker that already has every question, or a custom one', () => {
        const template = getTemplateById('gut')!;
        expect(
            moreQuestionsFor([{ id: 'h1', name: template.name, subvariables: template.subvariables.map(s => ({ name: s.name })) }])
        ).toEqual([]);
        expect(moreQuestionsFor([{ id: 'h2', name: 'My own tracker', subvariables: [] }])).toEqual([]);
    });
});
