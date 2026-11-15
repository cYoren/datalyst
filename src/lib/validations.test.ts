import { describe, expect, it } from 'vitest';
import { experimentFormSchema, updateHabitSchema } from './validations';

const base = { name: 'Coffee', independentId: 'ckx0000000000000000000000', dependentId: 'ckx0000000000000000000001', startDate: '2026-03-01', endDate: '2026-03-15' };

describe('experimentFormSchema dates', () => {
    it('accepts real calendar days', () => {
        expect(experimentFormSchema.safeParse(base).success).toBe(true);
    });
    it('rejects impossible days instead of rolling them into the next month', () => {
        expect(experimentFormSchema.safeParse({ ...base, startDate: '2026-02-31' }).success).toBe(false);
        expect(experimentFormSchema.safeParse({ ...base, endDate: '2026-13-01' }).success).toBe(false);
    });
});

describe('updateHabitSchema', () => {
    it('keeps the questions an edit sends, instead of stripping them', () => {
        // Before this, `createHabitSchema.partial()` dropped `subvariables` and the habit form's
        // save silently did nothing for them (ROADMAP.md W1: "add the rest of the pack").
        const parsed = updateHabitSchema.parse({
            name: 'Gut & Digestion',
            subvariables: [
                { id: 'ckx0000000000000000000002', name: 'Bloating', type: 'SCALE_0_10', order: 1 },
                { name: 'Normal bowel movement?', type: 'BOOLEAN', order: 2 },
            ],
        });
        expect(parsed.subvariables).toHaveLength(2);
        expect(parsed.subvariables?.[0]).toMatchObject({ id: 'ckx0000000000000000000002', name: 'Bloating', goalDirection: 'NEUTRAL' });
        expect(parsed.subvariables?.[1]).toMatchObject({ name: 'Normal bowel movement?', type: 'BOOLEAN' });
    });

    it('still refuses a question without a name', () => {
        expect(updateHabitSchema.safeParse({ subvariables: [{ name: '', type: 'NUMERIC' }] }).success).toBe(false);
    });
});
