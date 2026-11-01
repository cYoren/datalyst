import { describe, it, expect } from 'vitest';
import {
  APPROVED_MODELS,
  isModelApproved,
  getModelSpec,
  calculateTokenCost,
  estimateRequestCost,
  getApprovedModelIds,
} from '../providers/allowlist';
import { AiModelNotAllowedError } from '../providers/errors';
import type { AiModelSpec } from '../providers/types';

describe('AI Model Allowlist', () => {
  const customAllowlist: Record<string, AiModelSpec> = {
    ...APPROVED_MODELS,
    'custom-benchmarked-model': {
      modelId: 'custom-benchmarked-model',
      provider: 'custom',
      displayName: 'Custom Benchmarked Model',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      costPerInputTokenUsd: 0.00000015, // $0.15 / 1M tokens
      costPerOutputTokenUsd: 0.0000006,  // $0.60 / 1M tokens
      supportedCapabilities: ['text', 'json_object', 'structured_output'],
    },
  };

  it('identifies approved synthetic models from the default allowlist', () => {
    expect(isModelApproved('fake-model')).toBe(true);
    expect(isModelApproved('mock-echo')).toBe(true);
  });

  it('rejects unapproved vendor models by default pending benchmarks and configuration', () => {
    // Production vendor models must NOT be hard-coded into the default allowlist
    expect(isModelApproved('gemini-2.5-flash')).toBe(false);
    expect(isModelApproved('gemini-2.5-pro')).toBe(false);
    expect(isModelApproved('claude-3-5-sonnet')).toBe(false);
    expect(isModelApproved('gpt-4o')).toBe(false);
    expect(isModelApproved('gpt-4o-mini')).toBe(false);
    expect(isModelApproved('unapproved-model-v9')).toBe(false);
    expect(isModelApproved('')).toBe(false);
    expect(isModelApproved('   ')).toBe(false);
    expect(isModelApproved('../../../etc/passwd')).toBe(false);
  });

  it('returns valid model specs for approved synthetic models', () => {
    const spec = getModelSpec('fake-model');
    expect(spec.modelId).toBe('fake-model');
    expect(spec.provider).toBe('fake');
    expect(spec.contextWindow).toBe(32000);
    expect(spec.costPerInputTokenUsd).toBe(0);
    expect(spec.costPerOutputTokenUsd).toBe(0);
  });

  it('throws AiModelNotAllowedError when requesting spec for unapproved model', () => {
    expect(() => getModelSpec('unapproved-llm')).toThrow(AiModelNotAllowedError);

    try {
      getModelSpec('unapproved-llm', APPROVED_MODELS, 'corr-123');
    } catch (error) {
      expect(error).toBeInstanceOf(AiModelNotAllowedError);
      const aiErr = error as AiModelNotAllowedError;
      expect(aiErr.code).toBe('MODEL_NOT_ALLOWED');
      expect(aiErr.status).toBe(400);
      expect(aiErr.retryable).toBe(false);
      expect(aiErr.correlationId).toBe('corr-123');
    }
  });

  it('calculates token costs correctly according to model specs', () => {
    // Default synthetic fake-model has $0 cost
    const fakeCost = calculateTokenCost('fake-model', 1000, 500);
    expect(fakeCost).toBe(0);

    // Custom benchmarked model: 1,000,000 prompt tokens = $0.15, 1,000,000 completion tokens = $0.60
    const customCost = calculateTokenCost(
      'custom-benchmarked-model',
      1_000_000,
      1_000_000,
      customAllowlist
    );
    expect(customCost).toBeCloseTo(0.75, 4);

    // Unknown model returns 0
    expect(calculateTokenCost('non-existent', 500, 500)).toBe(0);
  });

  it('lists only default approved synthetic non-deprecated model identifiers', () => {
    const modelIds = getApprovedModelIds();
    expect(modelIds).toEqual(['fake-model', 'mock-echo']);
    expect(modelIds).not.toContain('gemini-2.5-flash');
    expect(modelIds).not.toContain('claude-3-5-sonnet');
    expect(modelIds).not.toContain('gpt-4o');
  });

  it('estimates a bounded request cost for budget preflight', () => {
    const customEstimate = estimateRequestCost(
      {
        modelId: 'custom-benchmarked-model',
        messages: [{ role: 'user', content: 'Synthetic prompt' }],
        maxTokens: 100,
      },
      customAllowlist
    );

    expect(customEstimate).toBeGreaterThan(0);
    expect(customEstimate).toBeLessThan(0.001);
    expect(estimateRequestCost({ modelId: 'fake-model', messages: [] })).toBe(0);
  });
});
