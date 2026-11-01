/**
 * Provider-neutral types for Datalyst AI boundary.
 * Server-only: never import or expose in client/browser bundles.
 */

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
  name?: string;
}

export type AiResponseFormat = 'text' | 'json_object';

export interface AiCompletionRequest {
  modelId: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  responseFormat?: AiResponseFormat;
  timeoutMs?: number;
  correlationId?: string;
  userId?: string;
}

export type AiFinishReason = 'stop' | 'length' | 'content_filter' | 'error' | 'unknown';

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface AiCompletionResponse {
  content: string;
  modelId: string;
  provider: string;
  finishReason: AiFinishReason;
  usage: AiTokenUsage;
  latencyMs: number;
  correlationId?: string;
}

export interface AiModelSpec {
  modelId: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  costPerInputTokenUsd: number;
  costPerOutputTokenUsd: number;
  supportedCapabilities: Array<'text' | 'json_object' | 'structured_output'>;
  deprecated?: boolean;
}

export interface AiProviderCallOptions {
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly name: string;
  generateText(
    request: AiCompletionRequest,
    options?: AiProviderCallOptions
  ): Promise<AiCompletionResponse>;
}

export interface AiRunMetadata {
  correlationId: string;
  userId?: string;
  provider: string;
  modelId: string;
  latencyMs: number;
  usage?: AiTokenUsage;
  success: boolean;
  errorClass?: string;
  attempts: number;
}
