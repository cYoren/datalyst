import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  AiError,
  AiModelNotAllowedError,
  AiBudgetExceededError,
  AiTimeoutError,
  AiRateLimitError,
  AiProviderUnavailableError,
  AiInvalidRequestError,
  AiAuthenticationError,
  AiProviderMismatchError,
  isAiError,
  isTransientError,
  normalizeAiError,
} from '../providers/errors';

describe('AI Error Normalization & Classification', () => {
  it('correctly identifies AiError instances', () => {
    const error = new AiTimeoutError('timed out');
    expect(isAiError(error)).toBe(true);
    expect(isAiError(new Error('generic'))).toBe(false);
    expect(isAiError(null)).toBe(false);
    expect(isAiError({ message: 'fake' })).toBe(false);
  });

  it('correctly classifies transient vs non-transient errors', () => {
    expect(isTransientError(new AiTimeoutError())).toBe(true);
    expect(isTransientError(new AiRateLimitError())).toBe(true);
    expect(isTransientError(new AiProviderUnavailableError())).toBe(true);

    expect(isTransientError(new AiModelNotAllowedError('bad-model'))).toBe(false);
    expect(isTransientError(new AiProviderMismatchError('fake', 'google', 'model'))).toBe(false);
    expect(isTransientError(new AiBudgetExceededError('budget'))).toBe(false);
    expect(isTransientError(new AiInvalidRequestError('invalid'))).toBe(false);
    expect(isTransientError(new AiAuthenticationError('auth'))).toBe(false);

    // Standard JavaScript errors with transient signatures
    expect(isTransientError(new Error('fetch failed: ECONNRESET'))).toBe(true);
    expect(isTransientError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isTransientError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isTransientError(new Error('SyntaxError in parsing'))).toBe(false);
  });

  it('normalizes Zod errors to AiInvalidRequestError with sanitized paths', () => {
    const testSchema = z.object({
      name: z.string().min(3),
      count: z.number().positive(),
    });

    try {
      testSchema.parse({ name: 'a', count: -5 });
    } catch (zodErr) {
      const normalized = normalizeAiError(zodErr, { correlationId: 'corr-zod' });
      expect(normalized).toBeInstanceOf(AiInvalidRequestError);
      expect(normalized.code).toBe('INVALID_REQUEST');
      expect(normalized.status).toBe(400);
      expect(normalized.retryable).toBe(false);
      expect(normalized.correlationId).toBe('corr-zod');
      expect(normalized.message).toContain('name');
      expect(normalized.message).toContain('count');
    }
  });

  it('normalizes HTTP status codes to proper AiError variants', () => {
    const authErr = Object.assign(new Error('Unauthorized'), { status: 401 });
    expect(normalizeAiError(authErr).code).toBe('AUTHENTICATION_ERROR');

    const rateErr = Object.assign(new Error('Rate limit exceeded'), { status: 429 });
    expect(normalizeAiError(rateErr).code).toBe('RATE_LIMITED');
    expect(normalizeAiError(rateErr).retryable).toBe(true);

    const badReqErr = Object.assign(new Error('Bad request'), { status: 400 });
    expect(normalizeAiError(badReqErr).code).toBe('INVALID_REQUEST');

    const serverErr = Object.assign(new Error('Internal Server Error'), { status: 500 });
    expect(normalizeAiError(serverErr).code).toBe('PROVIDER_UNAVAILABLE');
    expect(normalizeAiError(serverErr).retryable).toBe(true);

    const gatewayErr = Object.assign(new Error('Gateway Timeout'), { status: 504 });
    expect(normalizeAiError(gatewayErr).code).toBe('TIMEOUT');
  });

  it('sanitizes API keys and sensitive tokens from error messages', () => {
    const leakyError = new Error('Failed to authenticate with Bearer sk-secret1234567890abcdef and key-998877665544');
    const normalized = normalizeAiError(leakyError);

    expect(normalized.message).not.toContain('sk-secret1234567890abcdef');
    expect(normalized.message).not.toContain('key-998877665544');
    expect(normalized.message).toContain('[REDACTED');
  });

  it('preserves existing AiError properties while attaching context', () => {
    const original = new AiBudgetExceededError('Out of quota', 'c-1');
    const normalized = normalizeAiError(original, { provider: 'fake', modelId: 'fake-model' });

    expect(normalized).toBeInstanceOf(AiError);
    expect(normalized.code).toBe('BUDGET_EXCEEDED');
    expect(normalized.correlationId).toBe('c-1');
    expect(normalized.provider).toBe('fake');
    expect(normalized.modelId).toBe('fake-model');
  });

  it('constructs AiProviderMismatchError with details and non-retryable status 400', () => {
    const mismatch = new AiProviderMismatchError('fake', 'google', 'custom-gemini', 'corr-99');
    expect(mismatch).toBeInstanceOf(AiError);
    expect(mismatch.code).toBe('INVALID_REQUEST');
    expect(mismatch.status).toBe(400);
    expect(mismatch.retryable).toBe(false);
    expect(mismatch.correlationId).toBe('corr-99');
    expect(mismatch.details?.provider).toBe('fake');
    expect(mismatch.details?.expectedProvider).toBe('google');
    expect(mismatch.details?.modelId).toBe('custom-gemini');
    expect(mismatch.message).toContain("provider 'fake' cannot execute model 'custom-gemini'");
  });
});
