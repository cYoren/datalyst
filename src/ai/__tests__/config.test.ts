import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { aiConfiguration } from '../config';
import { OpenAICompatibleProvider } from '../providers/openai-compatible';
import { AnthropicProvider } from '../providers/anthropic';

describe('aiConfiguration', () => {
    it('is off with no keys', () => expect(aiConfiguration({})).toBeNull());
    it('keeps the legacy DeepSeek key working', () => {
        const c = aiConfiguration({ DEEPSEEK_API_KEY: 'k' })!;
        expect(c.providerName).toBe('DeepSeek');
        expect(c.createProvider()).toBeInstanceOf(AnthropicProvider);
    });
    it('accepts any OpenAI-compatible API, keyless for local servers', () => {
        const c = aiConfiguration({ AI_MODEL: 'llama3.2', AI_BASE_URL: 'http://ollama:11434/v1', AI_INPUT_USD_PER_MTOK: '0', AI_OUTPUT_USD_PER_MTOK: '0' })!;
        expect(c.providerName).toBe('ollama:11434');
        expect(c.spec.costPerInputTokenUsd).toBe(0);
        expect(c.createProvider()).toBeInstanceOf(OpenAICompatibleProvider);
    });
    it('provider name matches the model spec, so the execution policy accepts it', () => {
        for (const env of [{ AI_MODEL: 'm', AI_API_KEY: 'k' }, { AI_MODEL: 'm', AI_API_KEY: 'k', AI_PROVIDER: 'anthropic', AI_PROVIDER_NAME: 'Claude' }, { DEEPSEEK_API_KEY: 'k' }]) {
            const c = aiConfiguration(env)!;
            expect(c.createProvider().name).toBe(c.spec.provider);
        }
    });
    it('supports Anthropic and names known privacy policies', () => {
        const c = aiConfiguration({ AI_MODEL: 'claude-haiku-4-5', AI_API_KEY: 'k', AI_PROVIDER: 'anthropic' })!;
        expect(c.createProvider()).toBeInstanceOf(AnthropicProvider);
        expect(c.privacyUrl).toContain('anthropic.com');
    });
    it('needs a model', () => expect(aiConfiguration({ AI_API_KEY: 'k' })).toBeNull());
});

describe('OpenAICompatibleProvider', () => {
    it('sends a chat completion and reads usage', async () => {
        const transport = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 4 },
        })));
        const p = new OpenAICompatibleProvider('https://api.example.com/v1/', 'secret', 'Example', transport as typeof fetch);
        const r = await p.generateText({ modelId: 'm', messages: [{ role: 'user', content: 'hi' }] });
        expect(transport.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
        expect((transport.mock.calls[0][1]!.headers as Record<string, string>).authorization).toBe('Bearer secret');
        expect(r).toMatchObject({ content: '{"ok":true}', finishReason: 'stop', usage: { totalTokens: 14 } });
    });
    it('hides vendor error bodies', async () => {
        const p = new OpenAICompatibleProvider('http://x', undefined, 'x', (async () => new Response('secret prompt echo', { status: 500 })) as typeof fetch);
        await expect(p.generateText({ modelId: 'm', messages: [] })).rejects.toThrow('AI service request failed');
    });
});
