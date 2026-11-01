import { describe, it, expect, vi } from 'vitest';
import { AiExecutionPolicy } from '../policy/runner';
import { FakeAiProvider } from '../providers/fake-provider';
import { InMemoryAiCostTracker, type AiCostTracker } from '../policy/cost-tracker';
import {
  AiModelNotAllowedError,
  AiBudgetExceededError,
  AiTimeoutError,
  AiRateLimitError,
  AiInvalidRequestError,
  AiProviderMismatchError,
} from '../providers/errors';
import type { AiCompletionRequest, AiRunMetadata } from '../providers/types';

describe('AiExecutionPolicy Runner', () => {
  const validRequest: AiCompletionRequest = {
    modelId: 'fake-model',
    messages: [
      { role: 'system', content: 'Synthetic instructions' },
      { role: 'user', content: 'Draft a synthetic habit goal' },
    ],
    userId: 'test-user-1',
  };

  it('successfully executes pass-through with synthetic data', async () => {
    const fakeProvider = new FakeAiProvider({
      response: '{"goal": "Drink 2L water daily"}',
    });

    const emittedMetadata: AiRunMetadata[] = [];
    const policy = new AiExecutionPolicy({
      provider: fakeProvider,
      onRunComplete: (meta) => emittedMetadata.push(meta),
    });

    const response = await policy.execute(validRequest);

    expect(response.content).toBe('{"goal": "Drink 2L water daily"}');
    expect(response.modelId).toBe('fake-model');
    expect(response.provider).toBe('fake');
    expect(response.finishReason).toBe('stop');
    expect(response.usage.totalTokens).toBeGreaterThan(0);
    expect(response.correlationId).toBeDefined();

    expect(emittedMetadata).toHaveLength(1);
    expect(emittedMetadata[0].success).toBe(true);
    expect(emittedMetadata[0].modelId).toBe('fake-model');
    expect(emittedMetadata[0].provider).toBe('fake');
    expect(emittedMetadata[0].userId).toBe('test-user-1');
    // Ensure prompt/response text is NEVER stored on run metadata
    expect((emittedMetadata[0] as unknown as Record<string, unknown>).messages).toBeUndefined();
    expect((emittedMetadata[0] as unknown as Record<string, unknown>).content).toBeUndefined();
  });

  it('rejects unapproved model identifiers before invoking provider', async () => {
    const fakeProvider = new FakeAiProvider();
    const policy = new AiExecutionPolicy({ provider: fakeProvider });

    const badRequest: AiCompletionRequest = {
      modelId: 'unapproved-shadow-model',
      messages: [{ role: 'user', content: 'test' }],
    };

    await expect(policy.execute(badRequest)).rejects.toThrow(AiModelNotAllowedError);
    expect(fakeProvider.getRecordedRequests()).toHaveLength(0);
  });

  it('rejects provider/model mismatches before provider invocation', async () => {
    const fakeProvider = new FakeAiProvider({ name: 'fake' });
    const customAllowlist = {
      'custom-google-model': {
        modelId: 'custom-google-model',
        provider: 'google',
        displayName: 'Google Model',
        contextWindow: 32000,
        maxOutputTokens: 2048,
        costPerInputTokenUsd: 0,
        costPerOutputTokenUsd: 0,
        supportedCapabilities: ['text' as const],
      },
    };

    const policy = new AiExecutionPolicy({
      provider: fakeProvider,
      allowlist: customAllowlist,
    });

    const mismatchRequest: AiCompletionRequest = {
      modelId: 'custom-google-model',
      messages: [{ role: 'user', content: 'hello' }],
    };

    await expect(policy.execute(mismatchRequest)).rejects.toThrow(AiProviderMismatchError);
    // Provider call count must remain strictly zero
    expect(fakeProvider.getRecordedRequests()).toHaveLength(0);
  });

  it('enforces bounded timeout when provider exceeds allowed duration', async () => {
    const slowProvider = new FakeAiProvider({
      simulatedLatencyMs: 300,
    });

    const policy = new AiExecutionPolicy({
      provider: slowProvider,
      defaultTimeoutMs: 50, // Short timeout for test
      retryOptions: { maxRetries: 0 },
    });

    await expect(policy.execute(validRequest)).rejects.toThrow(AiTimeoutError);
  });

  it('retries transient provider failures and succeeds on recovery', async () => {
    const flakyProvider = new FakeAiProvider({
      errorSequence: [
        new AiRateLimitError('Rate limit spike 1'),
        new AiRateLimitError('Rate limit spike 2'),
      ],
      response: '{"recovered": true}',
    });

    const sleep = vi.fn().mockResolvedValue(undefined);
    const policy = new AiExecutionPolicy({
      provider: flakyProvider,
      retryOptions: { maxRetries: 2, initialBackoffMs: 10, sleep },
    });

    const response = await policy.execute(validRequest);
    expect(response.content).toBe('{"recovered": true}');
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('normalizes provider errors and emits safe failure metadata', async () => {
    const errorProvider = new FakeAiProvider({
      errorSequence: [new Error('503 Service Unavailable: overloaded')],
    });

    const emittedMetadata: AiRunMetadata[] = [];
    const policy = new AiExecutionPolicy({
      provider: errorProvider,
      retryOptions: { maxRetries: 0 },
      onRunComplete: (meta) => emittedMetadata.push(meta),
    });

    await expect(policy.execute(validRequest)).rejects.toThrow();

    expect(emittedMetadata).toHaveLength(1);
    expect(emittedMetadata[0].success).toBe(false);
    expect(emittedMetadata[0].errorClass).toBe('PROVIDER_UNAVAILABLE');
    expect(emittedMetadata[0].correlationId).toBeDefined();
  });

  it('enforces daily per-user cost budget and rejects when exceeded', async () => {
    let mockDate = new Date('2026-08-15T10:00:00Z');
    const costTracker = new InMemoryAiCostTracker({
      dailyLimitUsd: 0.05,
      clock: () => mockDate,
    });

    const provider = new FakeAiProvider({
      response: 'Synthetic answer',
    });

    const policy = new AiExecutionPolicy({
      provider,
      costTracker,
    });

    // Manually charge user up to budget
    costTracker.recordCost('user-budget-1', 0.05);

    // Next execution should be rejected at pre-flight check
    await expect(
      policy.execute({
        modelId: 'fake-model',
        messages: [{ role: 'user', content: 'Check budget' }],
        userId: 'user-budget-1',
      })
    ).rejects.toThrow(AiBudgetExceededError);

    // Roll date to next day
    mockDate = new Date('2026-08-16T10:00:00Z');

    // Should succeed on new day
    const day2Response = await policy.execute({
      modelId: 'fake-model',
      messages: [{ role: 'user', content: 'Check budget day 2' }],
      userId: 'user-budget-1',
    });
    expect(day2Response.content).toBe('Synthetic answer');
  });

  it('prevents provider invocation when async preflight assertion is rejected', async () => {
    const fakeProvider = new FakeAiProvider();
    const asyncTracker: AiCostTracker = {
      getDailyCost: vi.fn().mockResolvedValue(0),
      recordCost: vi.fn().mockResolvedValue(undefined),
      checkBudget: vi.fn().mockResolvedValue({ allowed: false, currentCostUsd: 1, limitUsd: 1, remainingUsd: 0 }),
      assertWithinBudget: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new AiBudgetExceededError('Async budget exceeded during preflight');
      }),
      reset: vi.fn(),
    };

    const policy = new AiExecutionPolicy({
      provider: fakeProvider,
      costTracker: asyncTracker,
    });

    await expect(policy.execute(validRequest)).rejects.toThrow(AiBudgetExceededError);
    // Provider must NEVER be called if preflight fails asynchronously
    expect(fakeProvider.getRecordedRequests()).toHaveLength(0);
    expect(asyncTracker.assertWithinBudget).toHaveBeenCalledTimes(1);
    expect(asyncTracker.recordCost).not.toHaveBeenCalled();
  });

  it('awaits asynchronous cost persistence upon successful execution', async () => {
    const fakeProvider = new FakeAiProvider({
      response: '{"status": "ok"}',
    });

    let persisted = false;
    const asyncTracker: AiCostTracker = {
      getDailyCost: vi.fn().mockResolvedValue(0),
      recordCost: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        persisted = true;
      }),
      checkBudget: vi.fn().mockResolvedValue({ allowed: true, currentCostUsd: 0, limitUsd: 1, remainingUsd: 1 }),
      assertWithinBudget: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }),
      reset: vi.fn(),
    };

    const policy = new AiExecutionPolicy({
      provider: fakeProvider,
      costTracker: asyncTracker,
    });

    const response = await policy.execute(validRequest);
    expect(response.content).toBe('{"status": "ok"}');
    // Cost must be guaranteed persisted when execute() promise resolves
    expect(persisted).toBe(true);
    expect(asyncTracker.assertWithinBudget).toHaveBeenCalledTimes(2); // Pre-flight and post-response
    expect(asyncTracker.recordCost).toHaveBeenCalledTimes(1);
  });

  it('rejects execution when async post-response budget check fails', async () => {
    const fakeProvider = new FakeAiProvider({
      response: '{"status": "ok"}',
    });

    let preflightDone = false;
    const asyncTracker: AiCostTracker = {
      getDailyCost: vi.fn().mockResolvedValue(0),
      recordCost: vi.fn().mockResolvedValue(undefined),
      checkBudget: vi.fn().mockResolvedValue({ allowed: true, currentCostUsd: 0, limitUsd: 1, remainingUsd: 1 }),
      assertWithinBudget: vi.fn().mockImplementation(async () => {
        if (!preflightDone) {
          preflightDone = true;
          return;
        }
        // Post-response assertion failure
        throw new AiBudgetExceededError('Usage exceeded limit post-completion');
      }),
      reset: vi.fn(),
    };

    const policy = new AiExecutionPolicy({
      provider: fakeProvider,
      costTracker: asyncTracker,
    });

    await expect(policy.execute(validRequest)).rejects.toThrow(AiBudgetExceededError);
    expect(fakeProvider.getRecordedRequests()).toHaveLength(1);
    expect(asyncTracker.recordCost).not.toHaveBeenCalled();
  });

  it('rejects invalid request schemas through Zod validation', async () => {
    const provider = new FakeAiProvider();
    const policy = new AiExecutionPolicy({ provider });

    const malformedRequest = {
      modelId: 'fake-model',
      messages: [], // Invalid: empty messages array
    } as unknown as AiCompletionRequest;

    await expect(policy.execute(malformedRequest)).rejects.toThrow(AiInvalidRequestError);
  });

  it('rejects a request whose estimated cost would exceed the daily budget', async () => {
    const customAllowlist = {
      'custom-priced-model': {
        modelId: 'custom-priced-model',
        provider: 'fake',
        displayName: 'Priced Model',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        costPerInputTokenUsd: 0.001,
        costPerOutputTokenUsd: 0.002,
        supportedCapabilities: ['text' as const],
      },
    };
    const costTracker = new InMemoryAiCostTracker({ dailyLimitUsd: 0.0001 });
    const provider = new FakeAiProvider();
    const policy = new AiExecutionPolicy({ provider, costTracker, allowlist: customAllowlist });

    await expect(
      policy.execute({
        modelId: 'custom-priced-model',
        messages: [{ role: 'user', content: 'Synthetic budget test' }],
        maxTokens: 1000,
        userId: 'user-budget-preflight',
      })
    ).rejects.toThrow(AiBudgetExceededError);
    expect(provider.getRecordedRequests()).toHaveLength(0);
  });
});
