import 'server-only';

import {
  AiProvider,
  AiCompletionRequest,
  AiCompletionResponse,
  AiRunMetadata,
  AiModelSpec,
} from '../providers/types';
import {
  APPROVED_MODELS,
  estimateRequestCost,
  getModelSpec,
  calculateTokenCost,
} from '../providers/allowlist';
import {
  AiTimeoutError,
  AiProviderMismatchError,
  normalizeAiError,
} from '../providers/errors';
import { aiCompletionRequestSchema, aiCompletionResponseSchema } from '../schemas';
import { AiCostTracker, InMemoryAiCostTracker } from './cost-tracker';
import { executeWithRetry, RetryOptions } from './retry';

export interface AiExecutionPolicyOptions {
  provider: AiProvider;
  costTracker?: AiCostTracker;
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
  retryOptions?: RetryOptions;
  allowlist?: Record<string, AiModelSpec>;
  onRunComplete?: (metadata: AiRunMetadata) => void;
}

export class AiExecutionPolicy {
  readonly provider: AiProvider;
  readonly costTracker: AiCostTracker;
  readonly defaultTimeoutMs: number;
  readonly maxTimeoutMs: number;
  readonly retryOptions: RetryOptions;
  readonly allowlist: Record<string, AiModelSpec>;
  readonly onRunComplete?: (metadata: AiRunMetadata) => void;

  constructor(options: AiExecutionPolicyOptions) {
    this.provider = options.provider;
    this.costTracker = options.costTracker ?? new InMemoryAiCostTracker();
    this.defaultTimeoutMs = Math.max(100, options.defaultTimeoutMs ?? 10000); // 10s default
    this.maxTimeoutMs = Math.max(this.defaultTimeoutMs, options.maxTimeoutMs ?? 60000); // 60s max
    this.retryOptions = options.retryOptions ?? {};
    this.allowlist = options.allowlist ?? APPROVED_MODELS;
    this.onRunComplete = options.onRunComplete;
  }

  async execute(rawRequest: AiCompletionRequest): Promise<AiCompletionResponse> {
    const correlationId =
      rawRequest.correlationId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const startTime = Date.now();
    let attempts = 0;

    try {
      // 1. Zod Request Schema Validation
      const validatedRequest = aiCompletionRequestSchema.parse({
        ...rawRequest,
        correlationId,
      });

      // 2. Approved Model Allowlist Check
      const modelSpec = getModelSpec(validatedRequest.modelId, this.allowlist, correlationId);

      // 2.1 Reject Provider/Model Mismatch Before Invocation
      if (this.provider.name !== modelSpec.provider) {
        throw new AiProviderMismatchError(
          this.provider.name,
          modelSpec.provider,
          validatedRequest.modelId,
          correlationId
        );
      }

      // 3. Daily Per-User Cost Pre-flight Check
      if (validatedRequest.userId) {
        await this.costTracker.assertWithinBudget(
          validatedRequest.userId,
          estimateRequestCost(validatedRequest, this.allowlist),
          undefined,
          correlationId
        );
      }

      // 4. Bounded Timeout Resolution
      const requestedTimeout = validatedRequest.timeoutMs ?? this.defaultTimeoutMs;
      const effectiveTimeoutMs = Math.min(
        Math.max(50, requestedTimeout),
        this.maxTimeoutMs
      );

      // 5. Provider Execution with Bounded Timeout and Transient Retry Policy
      const retryResult = await executeWithRetry(
        async (attemptNumber) => {
          attempts = attemptNumber;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, effectiveTimeoutMs);

          try {
            const rawResponse = await this.provider.generateText(validatedRequest, {
              signal: controller.signal,
            });
            return rawResponse;
          } catch (err) {
            if (controller.signal.aborted) {
              throw new AiTimeoutError(
                `Request timed out after ${effectiveTimeoutMs}ms`,
                correlationId,
                this.provider.name,
                validatedRequest.modelId
              );
            }
            throw err;
          } finally {
            clearTimeout(timeoutId);
          }
        },
        this.retryOptions,
        {
          provider: this.provider.name,
          modelId: validatedRequest.modelId,
          correlationId,
        }
      );

      attempts = retryResult.attempts;
      const providerResponse = retryResult.result;

      // 6. Response Validation with Zod
      const validatedResponse = aiCompletionResponseSchema.parse({
        ...providerResponse,
        correlationId,
      });

      // 7. Token Usage & Cost Calculation
      const computedCost = calculateTokenCost(
        validatedRequest.modelId,
        validatedResponse.usage.promptTokens,
        validatedResponse.usage.completionTokens,
        this.allowlist
      );

      const usageWithCost = {
        ...validatedResponse.usage,
        estimatedCostUsd: validatedResponse.usage.estimatedCostUsd || computedCost,
      };

      // 8. Record Per-User Cost Post-Execution
      if (validatedRequest.userId) {
        // Protect against providers reporting usage above the preflight estimate.
        await this.costTracker.assertWithinBudget(
          validatedRequest.userId,
          usageWithCost.estimatedCostUsd,
          undefined,
          correlationId
        );
        await this.costTracker.recordCost(validatedRequest.userId, usageWithCost.estimatedCostUsd);
      }

      const totalLatencyMs = Date.now() - startTime;
      const finalResponse: AiCompletionResponse = {
        ...validatedResponse,
        latencyMs: totalLatencyMs,
        usage: usageWithCost,
      };

      // 9. Emit Safe Operational Run Metadata (No sensitive payload logging)
      const metadata: AiRunMetadata = {
        correlationId,
        userId: validatedRequest.userId,
        provider: this.provider.name,
        modelId: validatedRequest.modelId,
        latencyMs: totalLatencyMs,
        usage: usageWithCost,
        success: true,
        attempts,
      };

      this.onRunComplete?.(metadata);

      return finalResponse;
    } catch (error) {
      const normalizedError = normalizeAiError(error, {
        provider: this.provider.name,
        modelId: rawRequest?.modelId,
        correlationId,
      });

      const totalLatencyMs = Date.now() - startTime;

      // Emit Safe Failure Metadata (No sensitive prompt/response content)
      const failureMetadata: AiRunMetadata = {
        correlationId,
        userId: rawRequest?.userId,
        provider: this.provider.name,
        modelId: rawRequest?.modelId || 'unknown',
        latencyMs: totalLatencyMs,
        success: false,
        errorClass: normalizedError.code,
        attempts: Math.max(1, attempts),
      };

      this.onRunComplete?.(failureMetadata);

      throw normalizedError;
    }
  }
}
