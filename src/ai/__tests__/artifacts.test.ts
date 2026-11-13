import { describe, it, expect } from 'vitest';
import {
    AI_ARTIFACT_SCHEMA_VERSION,
    aiArtifactSchema,
    aiRunMetadataSchema,
    evidencePacketSchema,
    parseAiArtifactContent,
    safeParseAiArtifactContent,
} from '../schemas/artifacts';
import { EVIDENCE_CASES, INVALID_MODEL_OUTPUTS } from './fixtures';
import { buildEvidence } from '../insights';

const packet = {
    id: 'ev_1',
    userId: 'user-1',
    source: 'correlation' as const,
    variableRefs: ['h1', 'h2'],
    observationWindow: { start: '2026-10-01', end: '2026-11-01' },
    sampleSize: 40,
    method: 'spearman',
    result: { coefficient: 0.62, pValue: 0.004 },
    dataQuality: { missingRate: 0.05, warnings: [] },
    limitations: ['observational'],
    generatedAt: '2026-11-13T10:00:00.000Z',
};

describe('evidence packet', () => {
    it('accepts a packet the engine could build', () => {
        expect(evidencePacketSchema.parse(packet).sampleSize).toBe(40);
    });

    it('refuses a p-value that cannot exist', () => {
        const bad = { ...packet, result: { coefficient: 0.6, pValue: 1.4 } };
        expect(evidencePacketSchema.safeParse(bad).success).toBe(false);
    });

    it('refuses a missing rate outside 0..1 and an unknown source', () => {
        expect(evidencePacketSchema.safeParse({ ...packet, dataQuality: { missingRate: 1.5, warnings: [] } }).success).toBe(false);
        expect(evidencePacketSchema.safeParse({ ...packet, source: 'vibes' }).success).toBe(false);
    });
});

describe('evidence packet bounds', () => {
    // The engine's own filter decides what is explainable; the packet schema decides what is
    // a number at all. Both are checked against the same fixture set.
    const row = (item: (typeof EVIDENCE_CASES)[number]) => ({
        variable1: { id: 'a', name: 'A', habit: 'Sleep', habitId: 'h1' },
        variable2: { id: 'b', name: 'B', habit: 'Mood', habitId: 'h2' },
        coefficient: item.coefficient, pValue: item.pValue, n: item.n, method: 'spearman',
    });

    it('keeps exactly the correlations the engine can explain', () => {
        for (const item of EVIDENCE_CASES) {
            const kept = buildEvidence([row(item)]).length;
            expect(kept, item.name).toBe(item.expect === 'explain' ? 1 : 0);
        }
    });

    it('refuses a coefficient outside -1..1 and an impossible p-value', () => {
        expect(evidencePacketSchema.safeParse({ ...packet, result: { coefficient: 1.4 } }).success).toBe(false);
        expect(evidencePacketSchema.safeParse({ ...packet, result: { coefficient: -1.4 } }).success).toBe(false);
        expect(evidencePacketSchema.safeParse({ ...packet, result: { pValue: 1.4 } }).success).toBe(false);
    });
});

describe('artifact content', () => {
    it('accepts one well-formed artifact per capability', () => {
        const protocol = parseAiArtifactContent('protocol_proposal', {
            goal: 'See whether late coffee affects sleep',
            variables: [{
                name: 'Late coffee', type: 'BOOLEAN', unit: null,
                schedule: { type: 'DAILY' }, timeBlock: 'AFTERNOON',
                rationale: 'The habit you asked about.', supported: true,
            }, {
                name: 'Sleep quality', type: 'SCALE_0_10', unit: null,
                schedule: { type: 'DAILY' }, timeBlock: 'MORNING',
                rationale: 'The outcome you want to explain.', supported: true,
            }],
            observationPeriodDays: 28,
            rationale: 'Two variables is enough to compare them.',
            assumptions: ['You drink coffee in the afternoon.'],
            experimentDirection: 'Coffee on some days, not others.',
        });
        expect(protocol.variables).toHaveLength(2);

        expect(parseAiArtifactContent('entry_draft', {
            matches: [{ subvariableId: 's1', normalizedValue: 1.5, confidence: 0.9, sourceText: '1h30' }],
            assumptions: [], unresolved: [], questions: [],
        }).matches[0].normalizedValue).toBe(1.5);

        expect(parseAiArtifactContent('insight_explanation', {
            finding: 'Late coffee and sleep quality move together.',
            direction: 'negative',
            evidenceIds: ['ev_1'], limitations: ['observational'], confounders: ['stress'], nextStep: null,
        }).evidenceIds).toEqual(['ev_1']);

        expect(parseAiArtifactContent('experiment_proposal', {
            hypothesis: 'Late coffee lowers sleep quality.',
            intervention: 'No coffee after 14:00', baseline: 'Coffee after 14:00 as usual',
            outcomeVariableId: 's2', independentVariableId: 'h1',
            schedule: { type: 'DAILY' }, durationDays: 28, washoutDays: 7,
            confounders: ['stress'], completionCriteria: 'At least 20 logged days per condition',
            limitations: ['Self-reported sleep quality'],
        }).durationDays).toBe(28);

        expect(parseAiArtifactContent('next_observation', {
            subvariableId: 's2', reason: 'Your outcome has the fewest logged days.',
            basis: 'power', burden: 'low',
        }).basis).toBe('power');
    });

    it('rejects every invalid model reply in the fixture set', () => {
        for (const fixture of INVALID_MODEL_OUTPUTS) {
            const result = safeParseAiArtifactContent(fixture.kind, fixture.content);
            expect(result.success, fixture.name).toBe(false);
        }
    });

    it('rejects a statistic the model made up instead of citing', () => {
        // No number is part of the contract: a pValue, a sample size or a method is a key the
        // schema does not have, so the model cannot hand the renderer a number the engine
        // never computed. All three are read from the cited packet.
        for (const invented of [{ pValue: 0.001 }, { sampleSize: 40 }, { method: 'spearman' }]) {
            const result = safeParseAiArtifactContent('insight_explanation', {
                finding: 'x', direction: 'positive',
                evidenceIds: ['ev_1'], limitations: ['observational'], confounders: [], nextStep: null,
                ...invented,
            });
            expect(result.success, JSON.stringify(invented)).toBe(false);
        }
    });
});

describe('artifact envelope', () => {
    it('requires a schema version and a known kind and status', () => {
        const base = {
            id: 'art_1', userId: 'user-1', kind: 'entry_draft', status: 'draft',
            schemaVersion: AI_ARTIFACT_SCHEMA_VERSION, evidenceRefs: [],
            content: { matches: [], assumptions: [], unresolved: [], questions: [] },
            createdAt: '2026-11-13T10:00:00.000Z',
        };
        expect(aiArtifactSchema.safeParse(base).success).toBe(true);
        expect(aiArtifactSchema.safeParse({ ...base, kind: 'chat' }).success).toBe(false);
        expect(aiArtifactSchema.safeParse({ ...base, status: 'maybe' }).success).toBe(false);
        expect(aiArtifactSchema.safeParse({ ...base, schemaVersion: undefined }).success).toBe(false);
        // The envelope cannot be used to smuggle unvalidated content past the per-kind schema.
        expect(aiArtifactSchema.safeParse({ ...base, content: {} }).success).toBe(false);
        expect(aiArtifactSchema.safeParse({ ...base, content: { matches: [], assumptions: [], unresolved: [], questions: [], writeImmediately: true } }).success).toBe(false);
    });
});

describe('run metadata record', () => {
    const record = {
        correlationId: 'req_1731_ab12', userRef: 'user-1', capability: 'insights',
        provider: 'fake', modelId: 'fake-model', promptVersion: 'insights-v3',
        schemaVersion: '1', latencyMs: 120, status: 'ok' as const,
        success: true, attempts: 1,
    };

    it('accepts the fields the roadmap allows', () => {
        expect(aiRunMetadataSchema.parse(record)).toMatchObject({ status: 'ok' });
    });

    it('refuses a field that would carry user text', () => {
        expect(aiRunMetadataSchema.safeParse({ ...record, prompt: 'slept badly' }).success).toBe(false);
        expect(aiRunMetadataSchema.safeParse({ ...record, status: 'done' }).success).toBe(false);
    });

    it('accepts what the policy runner actually emits', () => {
        // The runner's own metadata, not a hand-built object: the persistence contract has to
        // be satisfiable by a real run or it is fiction.
        const runnerShape = {
            correlationId: 'req_1731_ab12', userId: 'user-1', provider: 'fake',
            modelId: 'fake-model', latencyMs: 120, success: true, attempts: 1,
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCostUsd: 0.00001 },
        };
        expect(aiRunMetadataSchema.safeParse(runnerShape).success).toBe(true);
    });
});
