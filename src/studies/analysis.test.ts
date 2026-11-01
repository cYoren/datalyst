import { describe, expect, it } from 'vitest';
import { participantEffects, randomEffectsMetaAnalysis } from './analysis';

describe('study analysis', () => {
  it('matches a hand-calculated heterogeneous DL example', () => {
    const result = randomEffectsMetaAnalysis([{ participant: 'one', effect: 0, variance: 1, nA: 10, nB: 10 }, { participant: 'two', effect: 4, variance: 1, nA: 10, nB: 10 }])!;
    expect(result.effect).toBe(2);
    expect(result.q).toBe(8);
    expect(result.tauSquared).toBe(7);
    expect(result.standardError).toBe(2);
    expect(result.iSquared).toBe(87.5);
    expect(result.ci95[0]).toBeCloseTo(-1.92);
    expect(result.ci95[1]).toBeCloseTo(5.92);
  });
  it('reduces to inverse variance weighting with no heterogeneity', () => {
    const result = randomEffectsMetaAnalysis([{ participant: 'one', effect: 2, variance: 1, nA: 5, nB: 5 }, { participant: 'two', effect: 2, variance: 4, nA: 5, nB: 5 }])!;
    expect(result.tauSquared).toBe(0);
    expect(result.effect).toBe(2);
    expect(result.standardError).toBeCloseTo(Math.sqrt(0.8));
    expect(result.iSquared).toBe(0);
  });
  it('uses B minus A and sample variance without treating days as independent participants', () => {
    const { effects } = participantEffects([{ participant: 'one', day: 1, condition: 'A', value: 1 }, { participant: 'one', day: 2, condition: 'A', value: 3 }, { participant: 'one', day: 3, condition: 'B', value: 5 }, { participant: 'one', day: 4, condition: 'B', value: 7 }]);
    expect(effects).toEqual([{ participant: 'one', effect: 4, variance: 2, nA: 2, nB: 2 }]);
    expect(randomEffectsMetaAnalysis(effects)).toBeNull();
  });
  it('does not manufacture certainty from zero variance or insufficient data', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ participant: 'one', day: i + 1, condition: i < 2 ? 'A' as const : 'B' as const, value: 5 }));
    expect(participantEffects(rows).excluded).toHaveLength(1);
    expect(participantEffects(rows.slice(0, 2)).effects).toEqual([]);
    expect(randomEffectsMetaAnalysis([])).toBeNull();
    expect(() => randomEffectsMetaAnalysis([{ participant: 'one', effect: 1, variance: 0, nA: 2, nB: 2 }])).toThrow();
  });
  it('rejects nonfinite observations and duplicate participant days', () => {
    expect(() => participantEffects([{ participant: 'one', day: 1, condition: 'A', value: NaN }])).toThrow();
    expect(() => participantEffects([{ participant: 'one', day: 1, condition: 'A', value: 1 }, { participant: 'one', day: 1, condition: 'B', value: 2 }])).toThrow();
  });
});
