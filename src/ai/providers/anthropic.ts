import 'server-only';
import { z } from 'zod';
import type { AiProvider, AiCompletionRequest, AiProviderCallOptions, AiModelSpec } from './types';

// Explicit opt-in configuration; the default module allowlist remains synthetic.
// Verified against https://platform.claude.com/docs/en/models/overview, 2026-10-07.
export const ANTHROPIC_MODELS: Record<string, AiModelSpec> = {
  'claude-haiku-4-5-20251001': {
    modelId: 'claude-haiku-4-5-20251001', provider: 'anthropic', displayName: 'Claude Haiku 4.5',
    contextWindow: 200000, maxOutputTokens: 4096,
    costPerInputTokenUsd: 0.000001, costPerOutputTokenUsd: 0.000005,
    supportedCapabilities: ['text', 'json_object'],
  },
};

// DeepSeek speaks the Anthropic Messages format at its own base URL.
// Verified against https://api-docs.deepseek.com/quick_start/pricing, 2026-10-09 (peak prices, so the budget cap stays safe).
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';
export const DEEPSEEK_MODELS: Record<string, AiModelSpec> = {
  'deepseek-flash': {
    modelId: 'deepseek-flash', provider: 'deepseek', displayName: 'DeepSeek V4.1 Flash',
    contextWindow: 1000000, maxOutputTokens: 4096,
    costPerInputTokenUsd: 0.0000003, costPerOutputTokenUsd: 0.0000012,
    supportedCapabilities: ['text', 'json_object'],
  },
};

const responseSchema = z.object({
  model: z.string(), stop_reason: z.string().nullable(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
});

export class AnthropicProvider implements AiProvider {
  constructor(private apiKey: string, private transport: typeof fetch = fetch,
    private baseUrl = 'https://api.anthropic.com', readonly name = 'anthropic') {}

  async generateText(request: AiCompletionRequest, options?: AiProviderCallOptions) {
    const started = Date.now();
    const response = await this.transport(`${this.baseUrl}/v1/messages`, {
      method: 'POST', signal: options?.signal,
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: request.modelId, max_tokens: request.maxTokens ?? 1200,
        system: request.messages.filter(m => m.role === 'system').map(m => m.content).join('\n'),
        messages: request.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        temperature: request.temperature ?? 0, thinking: { type: 'disabled' },
      }),
    });
    if (!response.ok) {
      // Never include vendor response bodies (may echo sensitive prompts).
      throw Object.assign(new Error('AI service request failed'), { status: response.status });
    }
    const data = responseSchema.parse(await response.json());
    // Aliases (claude-haiku-4-5) come back as dated ids (claude-haiku-4-5-20251001).
    if (!data.model.startsWith(request.modelId)) throw new Error('Unexpected AI model');
    return {
      content: data.content.filter(c => c.type === 'text').map(c => c.text ?? '').join(''),
      modelId: request.modelId, provider: this.name,
      finishReason: data.stop_reason === 'end_turn' ? 'stop' as const : 'length' as const,
      usage: { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens },
      latencyMs: Date.now() - started,
    };
  }
}
