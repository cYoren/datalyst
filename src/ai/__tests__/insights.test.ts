import { describe, expect, it } from 'vitest';
import { FakeAiProvider } from '../providers/fake-provider';
import { AiExecutionPolicy } from '../policy/runner';
import { buildEvidence, createInsightRequest, evidenceHash, explainEvidence } from '../insights';
import { calculatePower } from '@/stats/analysis';

const row = { variable1: { id: 'a', name: 'Private name', habit: 'Private tracker', habitId: 'tracker-a' }, variable2: { id: 'b', name: 'Outcome', habit: 'Private outcome', habitId: 'tracker-b' }, coefficient: 0.6, pValue: 0.002, n: 30, method: 'pearson' };
const facts = buildEvidence([row]);
const history = { b: [4, 6, 5, 3, 8, 7, 4, 9, 3, 6] };
function setup(response: unknown, finishReason: 'stop' | 'length' = 'stop') {
  const provider = new FakeAiProvider({ response: JSON.stringify(response), finishReason });
  return { provider, policy: new AiExecutionPolicy({ provider }) };
}
const valid = { findings: [{ evidenceId: 1, interpretation: 'association' }], nextExperiment: { evidenceId: 1 } };

describe('Evidence-bound insights', () => {
  it('renders only supplied facts and uses deterministic power estimates', async () => {
    const { policy } = setup(valid);
    const result = await explainEvidence(policy, facts, history, 'fake-model');
    expect(result.findings[0].evidence).toEqual(facts[0]);
    // Both directions are offered; each power estimate uses the measured tracker's history.
    const [forward, reverse] = result.nextExperiment!.directions;
    expect(forward.power).toEqual(calculatePower(history.b, 0.10));
    expect([forward.independentId, forward.dependentId]).toEqual([reverse.dependentId, reverse.independentId]);
    expect(result.findings[0].explanation).toContain('does not establish cause');
  });
  it.each([
    { ...valid, findings: [{ evidenceId: 999, interpretation: 'association' }] },
    { ...valid, nextExperiment: { evidenceId: 999 } },
    { ...valid, inventedPValue: 0.0001 },
    { ...valid, findings: [{ evidenceId: 1, interpretation: 'cures insomnia' }] },
    { ...valid, findings: [{ evidenceId: 1, interpretation: 'association', explanation: '100% effective' }] },
    { ...valid, findings: [...valid.findings, ...valid.findings] },
  ])('rejects fabricated citations, claims and duplicate facts', async response => {
    await expect(explainEvidence(setup(response).policy, facts, history, 'fake-model')).rejects.toThrow();
  });
  it('rejects truncated responses', async () => {
    await expect(explainEvidence(setup(valid, 'length').policy, facts, history, 'fake-model')).rejects.toThrow('Incomplete');
  });
  it('does not send identifiers, labels, histories or text to the provider', () => {
    const request = JSON.stringify(createInsightRequest(facts, 'fake-model'));
    expect(request).not.toContain('Private');
    expect(request).not.toContain('variable1');
    expect(request).not.toContain(JSON.stringify(history.b));
  });
  it('invalidates cache for changed evidence, history, or model', () => {
    const hash = evidenceHash(facts, history, 'a');
    expect(evidenceHash(facts, history, 'b')).not.toBe(hash);
    expect(evidenceHash(facts, { b: [5, 6, 7] }, 'a')).not.toBe(hash);
    expect(evidenceHash([{ ...facts[0], n: 31 }], history, 'a')).not.toBe(hash);
  });
  it('filters invalid statistics and insufficient samples', () => {
    expect(buildEvidence([{ ...row, coefficient: NaN }, { ...row, n: 2 }, { ...row, pValue: -1 }])).toEqual([]);
  });
  it('keeps same-tracker insights but never proposes a tracker against itself', async () => {
    const withinTracker = buildEvidence([{ ...row, variable2: { ...row.variable2, habitId: 'tracker-a' } }]);
    const result = await explainEvidence(setup(valid).policy, withinTracker, history, 'fake-model');
    expect(result.findings).toHaveLength(1);
    expect(result.nextExperiment).toBeNull();
    const request = createInsightRequest(withinTracker, 'fake-model');
    expect(JSON.parse(request.messages[1].content)[0].canPlanExperiment).toBe(false);
  });
  it('accepts evidence explanations without a selected plan', async () => {
    const result = await explainEvidence(setup({ ...valid, nextExperiment: null }).policy, facts, history, 'fake-model');
    expect(result.findings).toHaveLength(1);
    expect(result.nextExperiment).toBeNull();
  });
});
