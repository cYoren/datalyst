import 'server-only';

/**
 * Synthetic evaluation fixtures. Never real user data, never a real journal line: every
 * string here was written for the test. Each case names the behaviour the deterministic
 * validator must show, so a regression fails a check instead of changing a score quietly.
 */

export interface EvaluationCase<Input> {
    name: string;
    input: Input;
    /** What the deterministic layer must do. The model's wording is never asserted. */
    expect: string;
}

/**
 * Correlation shapes for Capability C, including the ones that must produce no explanation.
 * Consumed by `artifacts.test.ts`; the goal and quick-log cases were deleted rather than kept
 * as decoration, and come back with the capability that reads them.
 */
export interface EvidenceCase {
    name: string;
    coefficient: number;
    pValue: number;
    n: number;
    expect: 'explain' | 'insufficient';
}

export const EVIDENCE_CASES: EvidenceCase[] = [
    { name: 'strong positive', coefficient: 0.62, pValue: 0.004, n: 40, expect: 'explain' },
    { name: 'strong negative', coefficient: -0.55, pValue: 0.01, n: 35, expect: 'explain' },
    { name: 'weak', coefficient: 0.08, pValue: 0.7, n: 60, expect: 'explain' },
    { name: 'nonsignificant', coefficient: 0.3, pValue: 0.2, n: 45, expect: 'explain' },
    { name: 'too few observations', coefficient: 0.9, pValue: 0.001, n: 6, expect: 'insufficient' },
    { name: 'not a correlation', coefficient: 1.4, pValue: 0.01, n: 40, expect: 'insufficient' },
    { name: 'impossible p-value', coefficient: 0.4, pValue: 1.4, n: 40, expect: 'insufficient' },
];

/** Model replies that must be rejected before anything is stored or shown. */
export const INVALID_MODEL_OUTPUTS: Array<{ name: string; kind: 'protocol_proposal' | 'insight_explanation' | 'entry_draft'; content: unknown }> = [
    {
        name: 'invented statistic in an explanation',
        kind: 'insight_explanation',
        content: { finding: 'Strong link', direction: 'positive', sampleSize: 40, method: 'spearman', evidenceIds: ['e1'], limitations: ['observational'], confounders: [], nextStep: null, pValue: 0.001 },
    },
    {
        name: 'no evidence citation',
        kind: 'insight_explanation',
        content: { finding: 'Strong link', direction: 'positive', sampleSize: 40, method: 'spearman', evidenceIds: [], limitations: ['observational'], confounders: [], nextStep: null },
    },
    {
        name: 'unsupported variable type',
        kind: 'protocol_proposal',
        content: {
            goal: 'sleep', variables: [{ name: 'Pressure', type: 'MMHG', unit: 'mmHg', schedule: { type: 'DAILY' }, timeBlock: 'ANYTIME', rationale: 'x', supported: true }],
            observationPeriodDays: 30, rationale: 'x', assumptions: [], experimentDirection: null,
        },
    },
    {
        name: 'draft value with no source text',
        kind: 'entry_draft',
        content: { matches: [{ subvariableId: 's1', normalizedValue: 7, confidence: 0.9 }], assumptions: [], unresolved: [], questions: [] },
    },
    {
        name: 'extra keys smuggled in',
        kind: 'entry_draft',
        content: { matches: [], assumptions: [], unresolved: [], questions: [], writeImmediately: true },
    },
];

/** Text that must never reach a log line, used against the redaction guard. */
export const SENSITIVE_STRINGS = [
    'gustavo.marcelino@example.com',
    'Bearer dl_abcdefghijklmnopqrstuvwxyz012345',
    'sk-proj-abcdefghijklmnopqrstuvwxyz012345',
    'https://example.com/reset?token=abcdefghijklmnop',
    'I had a panic attack after the third coffee and my chest hurt for an hour',
];
