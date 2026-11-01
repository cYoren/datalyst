import 'server-only';

import type {
  AiProvider,
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderCallOptions,
  AiTokenUsage,
  AiFinishReason,
} from './types';
import { AiTimeoutError } from './errors';

export type FakeResponseGenerator =
  | string
  | ((request: AiCompletionRequest) => string | Promise<string>);

export interface FakeAiProviderOptions {
  name?: string;
  response?: FakeResponseGenerator;
  simulatedLatencyMs?: number;
  simulatedUsage?: Partial<AiTokenUsage>;
  finishReason?: AiFinishReason;
  errorSequence?: Array<Error | (() => Error | Promise<Error>)>;
}

export class FakeAiProvider implements AiProvider {
  readonly name: string;
  private responseGenerator: FakeResponseGenerator;
  private simulatedLatencyMs: number;
  private simulatedUsage: Partial<AiTokenUsage>;
  private finishReason: AiFinishReason;
  private errorSequence: Array<Error | (() => Error | Promise<Error>)>;
  private recordedRequests: AiCompletionRequest[] = [];

  constructor(options: FakeAiProviderOptions = {}) {
    this.name = options.name ?? 'fake';
    this.responseGenerator = options.response ?? '{"status": "ok", "message": "Synthetic response"}';
    this.simulatedLatencyMs = options.simulatedLatencyMs ?? 0;
    this.simulatedUsage = options.simulatedUsage ?? {};
    this.finishReason = options.finishReason ?? 'stop';
    this.errorSequence = options.errorSequence ? [...options.errorSequence] : [];
  }

  setResponse(response: FakeResponseGenerator): void {
    this.responseGenerator = response;
  }

  setSimulatedLatency(ms: number): void {
    this.simulatedLatencyMs = ms;
  }

  setSimulatedUsage(usage: Partial<AiTokenUsage>): void {
    this.simulatedUsage = usage;
  }

  setErrorSequence(errors: Array<Error | (() => Error | Promise<Error>)>): void {
    this.errorSequence = [...errors];
  }

  getRecordedRequests(): AiCompletionRequest[] {
    return [...this.recordedRequests];
  }

  clearRecordedRequests(): void {
    this.recordedRequests = [];
  }

  async generateText(
    request: AiCompletionRequest,
    options?: AiProviderCallOptions
  ): Promise<AiCompletionResponse> {
    this.recordedRequests.push(request);

    // Simulate latency if configured
    if (this.simulatedLatencyMs > 0) {
      await this.sleep(this.simulatedLatencyMs, options?.signal);
    }

    if (options?.signal?.aborted) {
      throw new AiTimeoutError('Request aborted due to timeout', request.correlationId, this.name, request.modelId);
    }

    // Check error sequence for simulated transient/permanent failures
    if (this.errorSequence.length > 0) {
      const nextError = this.errorSequence.shift();
      if (nextError) {
        if (typeof nextError === 'function') {
          throw await nextError();
        }
        throw nextError;
      }
    }

    let content: string;
    if (typeof this.responseGenerator === 'function') {
      content = await this.responseGenerator(request);
    } else {
      content = this.responseGenerator;
    }

    const promptTokens = this.simulatedUsage.promptTokens ?? Math.max(10, request.messages.reduce((acc, m) => acc + m.content.length / 4, 0) | 0);
    const completionTokens = this.simulatedUsage.completionTokens ?? Math.max(5, content.length / 4 | 0);
    const totalTokens = promptTokens + completionTokens;

    return {
      content,
      modelId: request.modelId,
      provider: this.name,
      finishReason: this.finishReason,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: this.simulatedUsage.estimatedCostUsd ?? 0,
      },
      latencyMs: this.simulatedLatencyMs,
      correlationId: request.correlationId,
    };
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new AiTimeoutError('Operation cancelled by abort signal', undefined, this.name));
      }

      const timeoutId = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', abortListener);
        }
        resolve();
      }, ms);

      const abortListener = () => {
        clearTimeout(timeoutId);
        reject(new AiTimeoutError('Operation timed out', undefined, this.name));
      };

      if (signal) {
        signal.addEventListener('abort', abortListener, { once: true });
      }
    });
  }
}
