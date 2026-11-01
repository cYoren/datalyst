import { describe, it, expect } from 'vitest';
import { FakeAiProvider } from '../providers/fake-provider';
import { AiRateLimitError, AiTimeoutError } from '../providers/errors';
import type { AiCompletionRequest } from '../providers/types';

describe('FakeAiProvider', () => {
  const sampleRequest: AiCompletionRequest = {
    modelId: 'fake-model',
    messages: [
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'Synthetic prompt' },
    ],
  };

  it('generates synthetic responses and records requests', async () => {
    const provider = new FakeAiProvider({
      response: '{"result": "success"}',
    });

    const response = await provider.generateText(sampleRequest);

    expect(response.content).toBe('{"result": "success"}');
    expect(response.provider).toBe('fake');
    expect(response.modelId).toBe('fake-model');
    expect(response.finishReason).toBe('stop');
    expect(response.usage.totalTokens).toBeGreaterThan(0);

    const recorded = provider.getRecordedRequests();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].modelId).toBe('fake-model');
  });

  it('supports dynamic response generator functions', async () => {
    const provider = new FakeAiProvider({
      response: (req) => `Echo: ${req.messages[req.messages.length - 1].content}`,
    });

    const response = await provider.generateText(sampleRequest);
    expect(response.content).toBe('Echo: Synthetic prompt');
  });

  it('handles simulated error sequences', async () => {
    const provider = new FakeAiProvider({
      errorSequence: [
        new AiRateLimitError('Simulated rate limit'),
        () => new Error('Simulated transient failure'),
      ],
      response: 'Recovered response',
    });

    // Call 1 fails
    await expect(provider.generateText(sampleRequest)).rejects.toThrow('Simulated rate limit');

    // Call 2 fails
    await expect(provider.generateText(sampleRequest)).rejects.toThrow('Simulated transient failure');

    // Call 3 succeeds
    const response = await provider.generateText(sampleRequest);
    expect(response.content).toBe('Recovered response');
  });

  it('aborts cleanly when signal is triggered', async () => {
    const provider = new FakeAiProvider({
      simulatedLatencyMs: 200,
    });

    const controller = new AbortController();
    const promise = provider.generateText(sampleRequest, { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toThrow(AiTimeoutError);
  });
});
