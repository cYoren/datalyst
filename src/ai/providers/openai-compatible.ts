import 'server-only';
import { z } from 'zod';
import type { AiProvider, AiCompletionRequest, AiProviderCallOptions } from './types';

/**
 * Any OpenAI-compatible Chat Completions API: OpenAI, OpenRouter, Groq, Mistral, Together,
 * Gemini (OpenAI endpoint), DeepSeek, and local servers like Ollama, LM Studio or vLLM.
 */
const responseSchema = z.object({
    choices: z.array(z.object({
        message: z.object({ content: z.string().nullable().optional() }),
        finish_reason: z.string().nullable().optional(),
    })).min(1),
    usage: z.object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
    }).partial().nullish(),
});

export class OpenAICompatibleProvider implements AiProvider {
    constructor(private baseUrl: string, private apiKey: string | undefined,
        readonly name = 'openai', private transport: typeof fetch = fetch) {}

    async generateText(request: AiCompletionRequest, options?: AiProviderCallOptions) {
        const started = Date.now();
        const response = await this.transport(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST', signal: options?.signal,
            headers: {
                'content-type': 'application/json',
                ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
            },
            body: JSON.stringify({
                model: request.modelId,
                messages: request.messages.map(m => ({ role: m.role, content: m.content })),
                max_tokens: request.maxTokens ?? 1200,
                temperature: request.temperature ?? 0,
                ...(request.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
            }),
        });
        if (!response.ok) {
            // Never include vendor response bodies (may echo sensitive prompts).
            throw Object.assign(new Error('AI service request failed'), { status: response.status });
        }
        const data = responseSchema.parse(await response.json());
        const choice = data.choices[0];
        const promptTokens = data.usage?.prompt_tokens ?? 0;
        const completionTokens = data.usage?.completion_tokens ?? 0;
        return {
            content: choice.message.content ?? '',
            modelId: request.modelId, provider: this.name,
            finishReason: choice.finish_reason === 'length' ? 'length' as const
                : choice.finish_reason === 'content_filter' ? 'content_filter' as const : 'stop' as const,
            usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
            latencyMs: Date.now() - started,
        };
    }
}
