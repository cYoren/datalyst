import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { calculatePower } from '@/stats/analysis';
import { AiExecutionPolicy } from './policy/runner';

export interface EvidenceFact {
  id: number;
  variable1: { id: string; name: string; habit: string; habitId?: string };
  variable2: { id: string; name: string; habit: string; habitId?: string };
  coefficient: number; pValue: number; n: number; method: string;
}

// Provider chooses evidence and interpretation categories, never invents statistics
// or writes uncited claims. All explanations and numbers are rendered deterministically.
const interpretation = z.enum(['association', 'replication', 'confounding']);
const selectionSchema = z.object({
  findings: z.array(z.object({ evidenceId: z.number().int().positive(), interpretation }).strict()).min(1).max(3),
  nextExperiment: z.object({ evidenceId: z.number().int().positive() }).strict().nullable(),
}).strict();

export const EXPLANATIONS = {
  association: 'These measurements move together in your recorded data. An association does not establish cause and effect.',
  replication: 'Repeat this comparison with new observations to check whether the pattern persists.',
  confounding: 'Other factors or changes over time could explain this association. A planned comparison can help investigate it.',
};

export function buildEvidence(rows: Omit<EvidenceFact, 'id'>[]): EvidenceFact[] {
  return rows.filter(r => Number.isFinite(r.coefficient) && Math.abs(r.coefficient) <= 1 &&
    Number.isFinite(r.pValue) && r.pValue >= 0 && r.pValue <= 1 && Number.isInteger(r.n) && r.n >= 14)
    .slice(0, 10).map((r, i) => ({ ...r, id: i + 1 }));
}

export function evidenceHash(facts: EvidenceFact[], history: Record<string, number[]>, modelId: string) {
  // Must match the result payload version: a cached v2 payload has no nextExperiment.directions.
  return createHash('sha256').update(JSON.stringify({ version: 3, modelId, facts, history })).digest('hex');
}

const canPlanExperiment = (fact: EvidenceFact) => Boolean(fact.variable1.habitId && fact.variable2.habitId && fact.variable1.habitId !== fact.variable2.habitId);

export function createInsightRequest(facts: EvidenceFact[], modelId: string) {
  return {
    modelId, maxTokens: 800, temperature: 0, responseFormat: 'json_object' as const,
    messages: [
      { role: 'system' as const, content: 'Select useful evidence for a personal experiment. Return ONLY JSON: {"findings":[{"evidenceId":1,"interpretation":"association"}],"nextExperiment":{"evidenceId":1}}. Interpretations must be association, replication, or confounding. Cite ONLY evidenceId values supplied. nextExperiment must cite an item with canPlanExperiment=true, or be null when none is suitable. No text, additional keys, calculations, treatment advice, or causal claims. Choose up to three findings.' },
      { role: 'user' as const, content: JSON.stringify(facts.map(f => ({ evidenceId: f.id, coefficient: f.coefficient, pValue: f.pValue, n: f.n, method: f.method, canPlanExperiment: canPlanExperiment(f) }))) },
    ],
  };
}

export async function explainEvidence(policy: AiExecutionPolicy, facts: EvidenceFact[], history: Record<string, number[]>, modelId: string) {
  if (!facts.length) throw new Error('Insufficient evidence');
  const response = await policy.execute(createInsightRequest(facts, modelId));
  if (response.finishReason !== 'stop') throw new Error('Incomplete AI response');
  const selection = selectionSchema.parse(JSON.parse(response.content));
  const byId = new Map(facts.map(f => [f.id, f]));
  const citations = [...selection.findings.map(f => f.evidenceId), ...(selection.nextExperiment ? [selection.nextExperiment.evidenceId] : [])];
  if (citations.some(id => !byId.has(id))) throw new Error('AI cited evidence outside this packet');
  if (new Set(selection.findings.map(f => f.evidenceId)).size !== selection.findings.length) throw new Error('Duplicate evidence');
  const proposed = selection.nextExperiment ? byId.get(selection.nextExperiment.evidenceId)! : null;
  const chosen = proposed && canPlanExperiment(proposed) ? proposed : null;
  // A correlation has no direction and pair order is insertion order, so offer both directions
  // and let the user say which tracker they will change. Power is per outcome history.
  const direction = (change: EvidenceFact['variable1'], measure: EvidenceFact['variable1']) => {
    const rawPower = calculatePower((history[measure.id] ?? []).filter(Number.isFinite), 0.10);
    return { independentId: change.habitId ?? change.id, dependentId: measure.habitId ?? measure.id,
      change: change.habit, measure: measure.habit,
      power: rawPower && Number.isFinite(rawPower.requiredDays) ? rawPower : null };
  };
  return {
    version: 3,
    findings: selection.findings.map(f => ({ evidence: byId.get(f.evidenceId)!, explanation: EXPLANATIONS[f.interpretation] })),
    nextExperiment: chosen ? {
      evidenceId: chosen.id,
      directions: [direction(chosen.variable1, chosen.variable2), direction(chosen.variable2, chosen.variable1)],
      targetEffectPct: 0.10,
      note: 'Planning estimate for a relative change in the outcome. It assumes comparable observations and is not a guarantee. Review feasibility, safety, washout and carryover before starting.',
    } : null,
    limitations: 'Exploratory correlations are filtered for multiple comparisons; selective reporting, missing observations, and autocorrelation still limit inference. AI selected evidence; Datalyst calculated and rendered every statistic.',
  };
}
