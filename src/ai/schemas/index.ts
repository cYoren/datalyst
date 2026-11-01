import 'server-only';

import { z } from 'zod';
import type {
  AiRole,
  AiResponseFormat,
  AiFinishReason,
  AiMessage,
  AiCompletionRequest,
  AiTokenUsage,
  AiCompletionResponse,
  AiModelSpec,
} from '../providers/types';

export const aiRoleSchema = z.enum(['system', 'user', 'assistant']) satisfies z.ZodType<AiRole>;

export const aiMessageSchema = z.object({
  role: aiRoleSchema,
  content: z.string().min(1, 'Message content cannot be empty'),
  name: z.string().optional(),
}) satisfies z.ZodType<AiMessage>;

export const aiResponseFormatSchema = z.enum(['text', 'json_object']) satisfies z.ZodType<AiResponseFormat>;

export const aiCompletionRequestSchema = z.object({
  modelId: z.string().min(1, 'Model identifier is required'),
  messages: z.array(aiMessageSchema).min(1, 'At least one message is required'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(128000).optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).optional(),
  responseFormat: aiResponseFormatSchema.optional().default('text'),
  timeoutMs: z.number().int().positive().optional(),
  correlationId: z.string().optional(),
  userId: z.string().optional(),
}) satisfies z.ZodType<AiCompletionRequest>;

export const aiFinishReasonSchema = z.enum([
  'stop',
  'length',
  'content_filter',
  'error',
  'unknown',
]) satisfies z.ZodType<AiFinishReason>;

export const aiTokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative().optional(),
}) satisfies z.ZodType<AiTokenUsage>;

export const aiCompletionResponseSchema = z.object({
  content: z.string(),
  modelId: z.string().min(1, 'Model identifier is required'),
  provider: z.string().min(1, 'Provider identifier is required'),
  finishReason: aiFinishReasonSchema,
  usage: aiTokenUsageSchema,
  latencyMs: z.number().nonnegative(),
  correlationId: z.string().optional(),
}) satisfies z.ZodType<AiCompletionResponse>;

export const aiCapabilitySchema = z.enum(['text', 'json_object', 'structured_output']);

export const aiModelSpecSchema = z.object({
  modelId: z.string().min(1, 'modelId is required'),
  provider: z.string().min(1, 'provider is required'),
  displayName: z.string().min(1, 'displayName is required'),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  costPerInputTokenUsd: z.number().nonnegative(),
  costPerOutputTokenUsd: z.number().nonnegative(),
  supportedCapabilities: z.array(aiCapabilitySchema).min(1),
  deprecated: z.boolean().optional().default(false),
}) satisfies z.ZodType<AiModelSpec>;
