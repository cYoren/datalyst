import 'server-only';

import { z } from 'zod';

/**
 * The contracts between the deterministic engine and the model, from ROADMAP §7.
 *
 * Nothing the model produces is persisted or rendered until it parses here: an artifact is
 * a proposal with a schema version, never a database write. The evidence packet travels the
 * other way — the engine builds it, the model may only cite ids inside it.
 */

/** The variable types the product actually supports (`SubvariableType` in Prisma). */
export const aiVariableTypeSchema = z.enum(['BOOLEAN', 'SCALE_0_10', 'NUMERIC', 'CATEGORY']);
export const aiScheduleTypeSchema = z.enum(['DAILY', 'WEEKLY', 'ADHOC']);
export const aiTimeBlockSchema = z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME']);

// ---------------------------------------------------------------------------
// §7.1 Evidence packet — built by the statistics engine, never by the model
// ---------------------------------------------------------------------------

export const evidencePacketSchema = z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    source: z.enum(['correlation', 'trend', 'experiment']),
    variableRefs: z.array(z.string().min(1)).min(1),
    observationWindow: z.object({
        start: z.iso.date(),
        end: z.iso.date(),
    }),
    sampleSize: z.number().int().nonnegative(),
    method: z.string().min(1),
    result: z.object({
        coefficient: z.number().min(-1).max(1).optional(),
        pValue: z.number().min(0).max(1).optional(),
        effectSize: z.number().optional(),
        confidenceInterval: z.tuple([z.number(), z.number()]).optional(),
    }).strict(),
    dataQuality: z.object({
        missingRate: z.number().min(0).max(1),
        warnings: z.array(z.string()),
    }).strict(),
    limitations: z.array(z.string()),
    generatedAt: z.iso.datetime(),
}).strict();

export type EvidencePacket = z.infer<typeof evidencePacketSchema>;

// ---------------------------------------------------------------------------
// §7.2 AI artifact — a proposal the user accepts, rejects, or lets expire
// ---------------------------------------------------------------------------

export const aiArtifactKindSchema = z.enum([
    'protocol_proposal',
    'entry_draft',
    'insight_explanation',
    'experiment_proposal',
    'next_observation',
]);

export const aiArtifactStatusSchema = z.enum(['draft', 'accepted', 'rejected', 'expired']);

/** Bumped whenever a content schema below changes shape; stored beside the artifact. */
export const AI_ARTIFACT_SCHEMA_VERSION = '1';

const rationale = z.string().min(1).max(600);

/** Capability A. A variable the product cannot store must say so instead of being forced. */
export const protocolProposalContentSchema = z.object({
    goal: z.string().min(1).max(400),
    variables: z.array(z.object({
        name: z.string().min(1).max(80),
        type: aiVariableTypeSchema,
        unit: z.string().max(24).nullable(),
        schedule: z.object({
            type: aiScheduleTypeSchema,
            daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        }).strict(),
        timeBlock: aiTimeBlockSchema,
        rationale,
        /** False when the goal needs something Datalyst cannot track; the UI must say why. */
        supported: z.boolean(),
    }).strict()).min(1).max(8),
    observationPeriodDays: z.number().int().min(7).max(365),
    rationale,
    assumptions: z.array(z.string().max(300)).max(8),
    experimentDirection: z.string().max(300).nullable(),
}).strict();

/** Capability B. Every extracted value carries its own confidence and its source phrase. */
export const entryDraftContentSchema = z.object({
    matches: z.array(z.object({
        subvariableId: z.string().min(1),
        normalizedValue: z.number(),
        rawValue: z.string().max(120).optional(),
        confidence: z.number().min(0).max(1),
        /** The words in the user's text this value came from, so a correction is cheap. */
        sourceText: z.string().min(1).max(200),
    }).strict()).max(30),
    assumptions: z.array(z.string().max(300)).max(8),
    /** Text that matched no variable. Preserved, never forced into a field. */
    unresolved: z.array(z.string().max(200)).max(20),
    questions: z.array(z.string().max(200)).max(8),
}).strict();

/**
 * Capability C. Every number is a citation into the packet, not a model calculation, so the
 * schema carries no sample size and no method: both are read from the cited packet and
 * rendered by the app. The model may choose words and an interpretation, nothing numeric.
 */
export const insightExplanationContentSchema = z.object({
    finding: z.string().min(1).max(600),
    direction: z.enum(['positive', 'negative', 'unclear']),
    evidenceIds: z.array(z.string().min(1)).min(1).max(10),
    limitations: z.array(z.string().max(300)).min(1).max(8),
    confounders: z.array(z.string().max(300)).max(8),
    nextStep: z.string().max(400).nullable(),
}).strict();

/** Capability D. A plan to review, never an experiment that starts itself. */
export const experimentProposalContentSchema = z.object({
    hypothesis: z.string().min(1).max(400),
    intervention: z.string().min(1).max(400),
    baseline: z.string().min(1).max(400),
    outcomeVariableId: z.string().min(1),
    independentVariableId: z.string().min(1),
    schedule: z.object({
        type: aiScheduleTypeSchema,
        daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    }).strict(),
    durationDays: z.number().int().min(7).max(365),
    washoutDays: z.number().int().min(0).max(60),
    confounders: z.array(z.string().max(300)).max(8),
    completionCriteria: z.string().min(1).max(400),
    limitations: z.array(z.string().max(300)).min(1).max(8),
}).strict();

/** Capability E. One recommendation, with the reason it is the best next one. */
export const nextObservationContentSchema = z.object({
    subvariableId: z.string().min(1),
    reason: z.string().min(1).max(400),
    /** Why it is worth the effort now: power, missing data, or an active experiment. */
    basis: z.enum(['data_quality', 'power', 'experiment', 'schedule']),
    burden: z.enum(['low', 'medium', 'high']),
}).strict();

export const aiArtifactContentSchemas = {
    protocol_proposal: protocolProposalContentSchema,
    entry_draft: entryDraftContentSchema,
    insight_explanation: insightExplanationContentSchema,
    experiment_proposal: experimentProposalContentSchema,
    next_observation: nextObservationContentSchema,
} as const;

const artifactEnvelope = {
    id: z.string().min(1),
    userId: z.string().min(1),
    status: aiArtifactStatusSchema,
    schemaVersion: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)),
    corrections: z.unknown().optional(),
    createdAt: z.iso.datetime(),
    acceptedAt: z.iso.datetime().optional(),
} as const;

/**
 * Discriminated on `kind`, so `content` is checked against the schema for that kind. A plain
 * `content: z.unknown()` would make every per-kind schema optional for the one type that is
 * meant to be persisted.
 */
export const aiArtifactSchema = z.discriminatedUnion('kind', [
    z.object({ ...artifactEnvelope, kind: z.literal('protocol_proposal'), content: protocolProposalContentSchema }).strict(),
    z.object({ ...artifactEnvelope, kind: z.literal('entry_draft'), content: entryDraftContentSchema }).strict(),
    z.object({ ...artifactEnvelope, kind: z.literal('insight_explanation'), content: insightExplanationContentSchema }).strict(),
    z.object({ ...artifactEnvelope, kind: z.literal('experiment_proposal'), content: experimentProposalContentSchema }).strict(),
    z.object({ ...artifactEnvelope, kind: z.literal('next_observation'), content: nextObservationContentSchema }).strict(),
]);

export type AiArtifact = z.infer<typeof aiArtifactSchema>;
export type AiArtifactKind = z.infer<typeof aiArtifactKindSchema>;

/**
 * Parses model output against the schema for its kind. Throws a ZodError, which the caller
 * turns into a rejected run: unvalidated output is never stored, rendered or re-sent.
 */
export function parseAiArtifactContent<K extends AiArtifactKind>(kind: K, content: unknown) {
    return aiArtifactContentSchemas[kind].parse(content) as z.infer<(typeof aiArtifactContentSchemas)[K]>;
}

/** Same check without throwing, for a caller that wants to record a safe failure instead. */
export function safeParseAiArtifactContent(kind: AiArtifactKind, content: unknown) {
    return aiArtifactContentSchemas[kind].safeParse(content);
}

// ---------------------------------------------------------------------------
// §7.3 AI run metadata — safe to persist and safe to log
// ---------------------------------------------------------------------------

/**
 * The one run-metadata shape. It has to accept what the runner actually emits
 * (`AiRunMetadata` in `providers/types.ts`), or the "persist safe metadata" contract cannot
 * be satisfied by any real run. `capability`, `promptVersion` and `schemaVersion` are the
 * fields a caller adds when it knows them; a bare policy run does not.
 */
export const aiRunMetadataSchema = z.object({
    correlationId: z.string().min(1).max(80),
    /** Opaque, user-scoped id. Never an email, a name, or a journal line. */
    userRef: z.string().min(1).max(80).optional(),
    userId: z.string().min(1).max(80).optional(),
    capability: z.string().min(1).max(40).optional(),
    provider: z.string().min(1).max(80),
    modelId: z.string().min(1).max(80),
    promptVersion: z.string().min(1).max(40).optional(),
    schemaVersion: z.string().min(1).max(40).optional(),
    latencyMs: z.number().nonnegative(),
    usage: z.object({
        promptTokens: z.number().int().nonnegative(),
        completionTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
        estimatedCostUsd: z.number().nonnegative().optional(),
    }).strict().optional(),
    success: z.boolean(),
    attempts: z.number().int().positive(),
    status: z.enum(['ok', 'rejected', 'failed', 'refused']).optional(),
    errorClass: z.string().max(60).optional(),
    evidenceRefCount: z.number().int().nonnegative().optional(),
    // Fixed tokens only: this field is meant to say what was removed, never to quote it.
    redactionSummary: z.array(z.enum(['email', 'url', 'secret', 'credential', 'truncated'])).max(10).optional(),
}).strict();

export type AiRunMetadataRecord = z.infer<typeof aiRunMetadataSchema>;
