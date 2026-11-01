import 'server-only';

import { ZodError } from 'zod';

export type AiErrorCode =
  | 'MODEL_NOT_ALLOWED'
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'CONTENT_FILTERED'
  | 'BUDGET_EXCEEDED'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN_ERROR';

export interface AiErrorOptions {
  code: AiErrorCode;
  message: string;
  retryable?: boolean;
  status?: number;
  provider?: string;
  modelId?: string;
  correlationId?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  status?: number;
  provider?: string;
  modelId?: string;
  correlationId?: string;
  readonly details?: Record<string, unknown>;

  constructor(options: AiErrorOptions) {
    super(options.message);
    this.name = 'AiError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.provider = options.provider;
    this.modelId = options.modelId;
    this.correlationId = options.correlationId;
    this.details = options.details;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export class AiModelNotAllowedError extends AiError {
  constructor(modelId: string, correlationId?: string) {
    super({
      code: 'MODEL_NOT_ALLOWED',
      message: `Model '${sanitizeValue(modelId)}' is not in the approved allowlist`,
      retryable: false,
      status: 400,
      modelId,
      correlationId,
    });
    this.name = 'AiModelNotAllowedError';
  }
}

export class AiProviderMismatchError extends AiError {
  constructor(providerName: string, modelProvider: string, modelId: string, correlationId?: string) {
    super({
      code: 'INVALID_REQUEST',
      message: `Provider mismatch: provider '${sanitizeValue(providerName)}' cannot execute model '${sanitizeValue(modelId)}' (expected provider '${sanitizeValue(modelProvider)}')`,
      retryable: false,
      status: 400,
      provider: providerName,
      modelId,
      correlationId,
      details: {
        provider: providerName,
        expectedProvider: modelProvider,
        modelId,
      },
    });
    this.name = 'AiProviderMismatchError';
  }
}

export class AiBudgetExceededError extends AiError {
  constructor(message: string, correlationId?: string, details?: Record<string, unknown>) {
    super({
      code: 'BUDGET_EXCEEDED',
      message,
      retryable: false,
      status: 429,
      correlationId,
      details,
    });
    this.name = 'AiBudgetExceededError';
  }
}

export class AiTimeoutError extends AiError {
  constructor(message: string = 'AI provider request timed out', correlationId?: string, provider?: string, modelId?: string) {
    super({
      code: 'TIMEOUT',
      message,
      retryable: true,
      status: 504,
      correlationId,
      provider,
      modelId,
    });
    this.name = 'AiTimeoutError';
  }
}

export class AiRateLimitError extends AiError {
  constructor(message: string = 'AI provider rate limit exceeded', correlationId?: string, provider?: string, modelId?: string) {
    super({
      code: 'RATE_LIMITED',
      message,
      retryable: true,
      status: 429,
      correlationId,
      provider,
      modelId,
    });
    this.name = 'AiRateLimitError';
  }
}

export class AiProviderUnavailableError extends AiError {
  constructor(message: string = 'AI provider is currently unavailable', correlationId?: string, provider?: string, modelId?: string) {
    super({
      code: 'PROVIDER_UNAVAILABLE',
      message,
      retryable: true,
      status: 503,
      correlationId,
      provider,
      modelId,
    });
    this.name = 'AiProviderUnavailableError';
  }
}

export class AiInvalidRequestError extends AiError {
  constructor(message: string, correlationId?: string, details?: Record<string, unknown>) {
    super({
      code: 'INVALID_REQUEST',
      message,
      retryable: false,
      status: 400,
      correlationId,
      details,
    });
    this.name = 'AiInvalidRequestError';
  }
}

export class AiAuthenticationError extends AiError {
  constructor(message: string = 'AI provider authentication failed', correlationId?: string, provider?: string) {
    super({
      code: 'AUTHENTICATION_ERROR',
      message,
      retryable: false,
      status: 401,
      correlationId,
      provider,
    });
    this.name = 'AiAuthenticationError';
  }
}

export class AiContentFilteredError extends AiError {
  constructor(message: string = 'AI request was filtered by safety policies', correlationId?: string) {
    super({
      code: 'CONTENT_FILTERED',
      message,
      retryable: false,
      status: 400,
      correlationId,
    });
    this.name = 'AiContentFilteredError';
  }
}

export class AiMalformedResponseError extends AiError {
  constructor(message: string = 'AI provider returned a malformed response', correlationId?: string) {
    super({
      code: 'MALFORMED_RESPONSE',
      message,
      retryable: false,
      status: 502,
      correlationId,
    });
    this.name = 'AiMalformedResponseError';
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError;
}

export function isTransientError(error: unknown): boolean {
  if (isAiError(error)) {
    return error.retryable;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    if (name === 'timeouterror' || name === 'aborterror' || msg.includes('timeout') || msg.includes('timed out')) {
      return true;
    }
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
      return true;
    }
    if (
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('504') ||
      msg.includes('service unavailable') ||
      msg.includes('bad gateway') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes any error into a safe, classified AiError.
 * Removes sensitive tokens, keys, and credentials from messages.
 */
export function normalizeAiError(
  error: unknown,
  context?: { provider?: string; modelId?: string; correlationId?: string }
): AiError {
  if (isAiError(error)) {
    if (context?.provider && !error.provider) {
      error.provider = context.provider;
    }
    if (context?.modelId && !error.modelId) {
      error.modelId = context.modelId;
    }
    if (context?.correlationId && !error.correlationId) {
      error.correlationId = context.correlationId;
    }
    return error;
  }

  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return new AiInvalidRequestError(
      `Invalid request schema: ${issues.map((i) => `${i.path}: ${i.message}`).join(', ')}`,
      context?.correlationId,
      { issues }
    );
  }

  if (error instanceof Error) {
    const rawMessage = error.message || '';
    const cleanMessage = sanitizeValue(rawMessage);
    const errorName = error.name.toLowerCase();
    const status = extractHttpStatus(error, cleanMessage);

    if (errorName === 'aborterror' || errorName === 'timeouterror') {
      return new AiTimeoutError('Request timed out', context?.correlationId, context?.provider, context?.modelId);
    }

    if (
      status === 401 ||
      status === 403 ||
      cleanMessage.toLowerCase().includes('unauthorized') ||
      cleanMessage.toLowerCase().includes('authentication') ||
      cleanMessage.toLowerCase().includes('forbidden') ||
      cleanMessage.toLowerCase().includes('api key')
    ) {
      return new AiAuthenticationError('Provider authentication failed', context?.correlationId, context?.provider);
    }

    if (
      status === 429 ||
      cleanMessage.toLowerCase().includes('rate limit') ||
      cleanMessage.toLowerCase().includes('quota') ||
      cleanMessage.toLowerCase().includes('too many requests')
    ) {
      return new AiRateLimitError('Provider rate limit reached', context?.correlationId, context?.provider, context?.modelId);
    }

    if (
      status === 504 ||
      cleanMessage.toLowerCase().includes('gateway timeout') ||
      cleanMessage.toLowerCase().includes('timed out') ||
      cleanMessage.toLowerCase().includes('timeout')
    ) {
      return new AiTimeoutError(cleanMessage || 'Request timed out', context?.correlationId, context?.provider, context?.modelId);
    }

    if (
      (status && status >= 500) ||
      cleanMessage.toLowerCase().includes('503') ||
      cleanMessage.toLowerCase().includes('502') ||
      cleanMessage.toLowerCase().includes('500') ||
      cleanMessage.toLowerCase().includes('service unavailable') ||
      cleanMessage.toLowerCase().includes('bad gateway') ||
      cleanMessage.toLowerCase().includes('internal server error') ||
      cleanMessage.toLowerCase().includes('econnreset') ||
      cleanMessage.toLowerCase().includes('econnrefused') ||
      cleanMessage.toLowerCase().includes('etimedout') ||
      cleanMessage.toLowerCase().includes('network error') ||
      cleanMessage.toLowerCase().includes('fetch failed')
    ) {
      return new AiProviderUnavailableError(
        cleanMessage || `Provider service error (${status || 503})`,
        context?.correlationId,
        context?.provider,
        context?.modelId
      );
    }

    if (status === 400 || status === 422) {
      return new AiInvalidRequestError(`Provider rejected request: ${cleanMessage}`, context?.correlationId);
    }

    return new AiError({
      code: 'UNKNOWN_ERROR',
      message: cleanMessage || 'An unexpected error occurred during AI execution',
      retryable: false,
      status: status ?? 500,
      provider: context?.provider,
      modelId: context?.modelId,
      correlationId: context?.correlationId,
      cause: error,
    });
  }

  return new AiError({
    code: 'UNKNOWN_ERROR',
    message: 'An unknown non-error value was thrown during AI execution',
    retryable: false,
    status: 500,
    provider: context?.provider,
    modelId: context?.modelId,
    correlationId: context?.correlationId,
  });
}

function extractHttpStatus(error: unknown, message?: string): number | undefined {
  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
      return (error as { status: number }).status;
    }
    if ('statusCode' in error && typeof (error as { statusCode: unknown }).statusCode === 'number') {
      return (error as { statusCode: number }).statusCode;
    }
  }
  if (message) {
    const match = message.match(/\b(400|401|403|404|422|429|500|502|503|504)\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}

/**
 * Strips potentially sensitive strings like API keys or bearer tokens.
 */
function sanitizeValue(val: string): string {
  if (!val) return '';
  return val
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, 'Bearer [REDACTED]')
    .replace(/(?:sk-|key-|api[_-]?key=)[a-zA-Z0-9_\-\.]{10,}/gi, '[REDACTED_API_KEY]');
}
