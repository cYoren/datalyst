import { describe, it, expect, vi } from 'vitest';
import { executeWithRetry } from '../policy/retry';
import { AiRateLimitError, AiInvalidRequestError } from '../providers/errors';

describe('executeWithRetry', () => {
  it('returns immediately on first attempt success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const sleep = vi.fn();

    const { result, attempts } = await executeWithRetry(fn, { maxRetries: 3, sleep });

    expect(result).toBe('success');
    expect(attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries transient failures and succeeds on subsequent attempts', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount < 3) {
        throw new AiRateLimitError('Rate limit on attempt ' + callCount);
      }
      return 'recovered';
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const { result, attempts } = await executeWithRetry(fn, {
      maxRetries: 3,
      initialBackoffMs: 50,
      backoffMultiplier: 2,
      sleep,
    });

    expect(result).toBe('recovered');
    expect(attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 50);
    expect(sleep).toHaveBeenNthCalledWith(2, 100);
  });

  it('does not retry non-transient errors', async () => {
    const fn = vi.fn().mockRejectedValue(new AiInvalidRequestError('Bad prompt schema'));
    const sleep = vi.fn();

    await expect(
      executeWithRetry(fn, { maxRetries: 3, sleep })
    ).rejects.toThrow('Bad prompt schema');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('throws normalized error after exhausting maxRetries', async () => {
    const fn = vi.fn().mockRejectedValue(new AiRateLimitError('Persistent rate limit'));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      executeWithRetry(fn, { maxRetries: 2, sleep })
    ).rejects.toThrow('Persistent rate limit');

    expect(fn).toHaveBeenCalledTimes(3); // Attempt 1 + 2 retries
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
