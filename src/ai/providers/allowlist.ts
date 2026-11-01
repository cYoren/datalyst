import 'server-only';

import type { AiCompletionRequest, AiModelSpec } from './types';
import { AiModelNotAllowedError } from './errors';

export const APPROVED_MODELS: Record<string, AiModelSpec> = {
  // Synthetic / Test models (Cost $0.00)
  'fake-model': {
    modelId: 'fake-model',
    provider: 'fake',
    displayName: 'Fake Provider Model',
    contextWindow: 32000,
    maxOutputTokens: 4096,
    costPerInputTokenUsd: 0,
    costPerOutputTokenUsd: 0,
    supportedCapabilities: ['text', 'json_object', 'structured_output'],
  },
  'mock-echo': {
    modelId: 'mock-echo',
    provider: 'fake',
    displayName: 'Mock Echo Model',
    contextWindow: 16000,
    maxOutputTokens: 2048,
    costPerInputTokenUsd: 0,
    costPerOutputTokenUsd: 0,
    supportedCapabilities: ['text', 'json_object'],
  },
};

/**
 * Checks whether a given model identifier is registered in the allowlist.
 */
export function isModelApproved(
  modelId: string,
  customAllowlist: Record<string, AiModelSpec> = APPROVED_MODELS
): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  const spec = customAllowlist[modelId.trim()];
  return Boolean(spec && !spec.deprecated);
}

/**
 * Retrieves the specification for an approved model, or throws AiModelNotAllowedError.
 */
export function getModelSpec(
  modelId: string,
  customAllowlist: Record<string, AiModelSpec> = APPROVED_MODELS,
  correlationId?: string
): AiModelSpec {
  if (!isModelApproved(modelId, customAllowlist)) {
    throw new AiModelNotAllowedError(modelId, correlationId);
  }
  return customAllowlist[modelId.trim()];
}

/**
 * Calculates estimated USD cost for a run based on token counts.
 */
export function calculateTokenCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  customAllowlist: Record<string, AiModelSpec> = APPROVED_MODELS
): number {
  const spec = customAllowlist[modelId.trim()];
  if (!spec) return 0;
  const inputCost = (promptTokens || 0) * spec.costPerInputTokenUsd;
  const outputCost = (completionTokens || 0) * spec.costPerOutputTokenUsd;
  return Number((inputCost + outputCost).toFixed(8));
}

/** Conservatively estimates a request cost for budget preflight. */
export function estimateRequestCost(
  request: Pick<AiCompletionRequest, 'modelId' | 'messages' | 'maxTokens'>,
  customAllowlist: Record<string, AiModelSpec> = APPROVED_MODELS
): number {
  const spec = customAllowlist[request.modelId.trim()];
  if (!spec) return 0;

  const estimatedPromptTokens = Math.ceil(
    request.messages.reduce((total, message) => total + message.content.length, 0) / 4
  );
  const estimatedCompletionTokens = Math.min(request.maxTokens ?? 1024, spec.maxOutputTokens);
  return Number(
    (
      estimatedPromptTokens * spec.costPerInputTokenUsd +
      estimatedCompletionTokens * spec.costPerOutputTokenUsd
    ).toFixed(8)
  );
}

/**
 * Returns all currently approved model identifiers.
 */
export function getApprovedModelIds(
  customAllowlist: Record<string, AiModelSpec> = APPROVED_MODELS
): string[] {
  return Object.keys(customAllowlist).filter((key) => !customAllowlist[key].deprecated);
}
