import 'server-only';

import { isSafeRunMetadata } from './redaction';
import type { AiRunMetadata } from './providers/types';

/**
 * The one place an AI run is written down, and the reason the redaction guard exists.
 *
 * Until this module there was no AI logging path at all, so "no sensitive payload reaches
 * logs" was true only because nothing logged. Now every run is written, and it is checked
 * first: metadata that fails the guard is dropped rather than printed, and the drop is
 * counted, so a regression shows up as a non-zero counter instead of a leaked journal line.
 */

let droppedRuns = 0;

/** Runs whose metadata failed the guard and were therefore not logged. */
export function unsafeRunCount(): number {
    return droppedRuns;
}

export function logAiRun(metadata: AiRunMetadata): void {
    const record: Record<string, unknown> = { ...metadata };
    if (!isSafeRunMetadata(record)) {
        droppedRuns += 1;
        // Deliberately says nothing about the content: naming the offending field would
        // print the thing we just refused to print.
        console.error('[ai] run metadata rejected by the redaction guard');
        return;
    }
    // Identifiers, counts and codes only. `userId` is the caller's opaque id, never an email.
    console.info('[ai] run', {
        correlationId: metadata.correlationId,
        provider: metadata.provider,
        modelId: metadata.modelId,
        latencyMs: metadata.latencyMs,
        success: metadata.success,
        attempts: metadata.attempts,
        errorClass: metadata.errorClass,
        promptTokens: metadata.usage?.promptTokens,
        completionTokens: metadata.usage?.completionTokens,
        estimatedCostUsd: metadata.usage?.estimatedCostUsd,
    });
}
