import 'server-only';

import { isTransientError, normalizeAiError } from '../providers/errors';

export interface RetryOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  sleep?: (ms: number) => Promise<void>;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
  context?: { provider?: string; modelId?: string; correlationId?: string }
): Promise<RetryResult<T>> {
  const maxRetries = options.maxRetries ?? 2;
  const initialBackoffMs = options.initialBackoffMs ?? 50;
  const maxBackoffMs = options.maxBackoffMs ?? 1000;
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  const jitter = options.jitter ?? false;
  const sleep = options.sleep ?? defaultSleep;
  const customShouldRetry = options.shouldRetry;

  let attempt = 0;
  let currentBackoff = initialBackoffMs;

  while (true) {
    attempt += 1;
    try {
      const result = await operation(attempt);
      return { result, attempts: attempt };
    } catch (error) {
      const isRetryable = customShouldRetry
        ? customShouldRetry(error, attempt)
        : isTransientError(error);

      if (!isRetryable || attempt > maxRetries) {
        throw normalizeAiError(error, context);
      }

      // Calculate backoff with optional jitter
      let sleepTime = Math.min(currentBackoff, maxBackoffMs);
      if (jitter) {
        sleepTime = Math.floor(sleepTime * (0.5 + Math.random() * 0.5));
      }

      await sleep(sleepTime);
      currentBackoff = Math.min(currentBackoff * backoffMultiplier, maxBackoffMs);
    }
  }
}
