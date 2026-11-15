import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { EXPERIMENT_TEMPLATES, experimentTemplateById } from './experiment-templates';
import { getTemplateById } from './templates';

describe('experiment templates', () => {
    it('points every tracker at a real habit template, under its real name', () => {
        for (const template of EXPERIMENT_TEMPLATES) {
            for (const ref of [template.independent, template.dependent]) {
                const definition = getTemplateById(ref.templateId);
                expect(definition, `${template.id} → ${ref.templateId}`).toBeDefined();
                // The flow looks trackers up by name, so a rename must not silently create a duplicate.
                expect(definition!.name, `${template.id} → ${ref.templateId}`).toBe(ref.name);
            }
        }
    });

    it('tests two different things for at least eight days', () => {
        for (const template of EXPERIMENT_TEMPLATES) {
            expect(template.independent.templateId, template.id).not.toBe(template.dependent.templateId);
            // createExperiment requires 8 to 366 days; totalDays counts both ends.
            expect(template.days, template.id).toBeGreaterThanOrEqual(8);
            expect(template.days, template.id).toBeLessThanOrEqual(366);
        }
    });

    it('has unique ids and a question a person would ask', () => {
        const ids = EXPERIMENT_TEMPLATES.map((template) => template.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const template of EXPERIMENT_TEMPLATES) {
            expect(template.question.endsWith('?'), template.id).toBe(true);
            expect(template.explanation.length, template.id).toBeGreaterThan(20);
        }
    });

    it('resolves the ids the Lab links to, and nothing else', () => {
        // The bug A2 fixes: the Lab linked to ?template=caffeine and the form ignored it.
        const labPage = readFileSync(
            path.resolve(process.cwd(), 'src/app/(app)/lab/page.tsx'),
            'utf8'
        );
        const linked = [...labPage.matchAll(/\/lab\/new\?template=([a-z-]+)/g)].map((match) => match[1]);
        // The exact set, both ways: a link with no template fails, and a template with no link
        // fails too. `linked.length > 0` alone would pass while the regex stopped matching.
        expect(new Set(linked)).toEqual(new Set(EXPERIMENT_TEMPLATES.map((template) => template.id)));
        for (const id of linked) expect(experimentTemplateById(id), id).toBeDefined();
        expect(experimentTemplateById('nope')).toBeUndefined();
        expect(experimentTemplateById(null)).toBeUndefined();
    });
});
