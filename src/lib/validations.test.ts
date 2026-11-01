import { describe, expect, it } from 'vitest';
import { experimentFormSchema } from './validations';

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
