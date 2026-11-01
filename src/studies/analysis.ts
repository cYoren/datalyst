export interface StudyRow { participant: string; day: number; condition: 'A' | 'B'; value: number }
export interface Effect { participant: string; effect: number; variance: number; nA: number; nB: number }

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const variance = (values: number[]) => values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) / (values.length - 1);

/** Each participant contributes one independent effect. Never pool repeated days as participants. */
export function participantEffects(rows: StudyRow[]) {
  const groups = new Map<string, StudyRow[]>();
  for (const row of rows) {
    if (!Number.isFinite(row.value)) throw new Error('Non-finite outcome');
    groups.set(row.participant, [...(groups.get(row.participant) ?? []), row]);
  }
  const effects: Effect[] = [];
  const excluded: { participant: string; reason: string }[] = [];
  for (const [participant, records] of groups) {
    if (new Set(records.map(row => row.day)).size !== records.length) throw new Error('Duplicate participant day');
    const a = records.filter(row => row.condition === 'A').map(row => row.value);
    const b = records.filter(row => row.condition === 'B').map(row => row.value);
    if (a.length < 2 || b.length < 2) { excluded.push({ participant, reason: 'At least two observations per condition are required' }); continue; }
    const samplingVariance = variance(a) / a.length + variance(b) / b.length;
    if (!(samplingVariance > 0) || !Number.isFinite(samplingVariance)) { excluded.push({ participant, reason: 'Sampling variance must be finite and positive' }); continue; }
    effects.push({ participant, effect: mean(b) - mean(a), variance: samplingVariance, nA: a.length, nB: b.length });
  }
  return { effects, excluded };
}

/** DerSimonian–Laird method of moments with a normal approximate 95% interval. */
export function randomEffectsMetaAnalysis(effects: Effect[]) {
  if (effects.some(item => !Number.isFinite(item.effect) || !Number.isFinite(item.variance) || item.variance <= 0)) throw new Error('Invalid effect variance');
  if (effects.length < 2) return null;
  const weights = effects.map(item => 1 / item.variance);
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const fixed = effects.reduce((sum, item, i) => sum + item.effect * weights[i], 0) / sumWeights;
  const q = effects.reduce((sum, item, i) => sum + weights[i] * (item.effect - fixed) ** 2, 0);
  const df = effects.length - 1;
  const c = sumWeights - weights.reduce((sum, value) => sum + value ** 2, 0) / sumWeights;
  const tauSquared = Math.max(0, (q - df) / c);
  const randomWeights = effects.map(item => 1 / (item.variance + tauSquared));
  const randomSum = randomWeights.reduce((a, b) => a + b, 0);
  const effect = effects.reduce((sum, item, i) => sum + item.effect * randomWeights[i], 0) / randomSum;
  const standardError = Math.sqrt(1 / randomSum);
  return { method: 'DerSimonian-Laird', k: effects.length, effect, standardError, ci95: [effect - 1.96 * standardError, effect + 1.96 * standardError], tauSquared, q, iSquared: q > 0 ? Math.max(0, (q - df) / q) * 100 : 0 };
}

export const analysisLimitations = 'Exploratory mean difference (B − A) in the protocol outcome unit. Within-person variance assumes independent daily errors; serial correlation, carryover, missingness and adherence can bias estimates and intervals. The normal approximate DL interval can be too narrow with few participants. No causal or clinical conclusion is warranted from this estimate alone. No imputation, per-protocol filtering or multiple-outcome selection is performed.';
