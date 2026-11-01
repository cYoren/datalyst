import 'server-only';
import { AnthropicProvider, DEEPSEEK_BASE_URL, DEEPSEEK_MODELS } from './providers/anthropic';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import type { AiModelSpec, AiProvider } from './providers/types';

/**
 * Bring any LLM. Configure with:
 *   AI_MODEL     model id, e.g. gpt-5-mini, claude-haiku-4-5, llama3.2, openrouter/auto
 *   AI_API_KEY   provider key (optional for local servers such as Ollama)
 *   AI_BASE_URL  OpenAI-compatible base URL (default https://api.openai.com/v1)
 *   AI_PROVIDER  "openai" (default, any OpenAI-compatible API) or "anthropic"
 *   AI_PROVIDER_NAME  shown to users in the consent text (default: the API host)
 *   AI_PRIVACY_URL    provider privacy policy shown next to the consent box
 *   AI_INPUT_USD_PER_MTOK / AI_OUTPUT_USD_PER_MTOK  prices for the daily budget (default 1 / 5)
 * Legacy: DEEPSEEK_API_KEY (+ DEEPSEEK_MODEL_ID) still works unchanged.
 */
export interface AiConfiguration {
    modelId: string;
    spec: AiModelSpec;
    providerName: string;
    privacyUrl: string | null;
    createProvider: () => AiProvider;
}

const KNOWN_PRIVACY: Record<string, string> = {
    'api.deepseek.com': 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html',
    'api.openai.com': 'https://openai.com/policies/row-privacy-policy/',
    'api.anthropic.com': 'https://www.anthropic.com/legal/privacy',
    'openrouter.ai': 'https://openrouter.ai/privacy',
    'api.groq.com': 'https://groq.com/privacy-policy/',
};

function price(raw: string | undefined, fallback: number) {
    const value = raw?.trim() ? Number(raw) : NaN;
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function aiConfiguration(env: Record<string, string | undefined> = process.env): AiConfiguration | null {
    const model = env.AI_MODEL?.trim();
    if (model && (env.AI_API_KEY || env.AI_BASE_URL)) {
        const kind = env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
        const baseUrl = env.AI_BASE_URL?.trim() || (kind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1');
        let host = baseUrl;
        try { host = new URL(baseUrl).host; } catch { /* keep raw */ }
        const providerName = env.AI_PROVIDER_NAME?.trim() || host;
        const spec: AiModelSpec = {
            modelId: model, provider: providerName, displayName: model,
            contextWindow: 128000, maxOutputTokens: 4096,
            costPerInputTokenUsd: price(env.AI_INPUT_USD_PER_MTOK, 1) / 1e6,
            costPerOutputTokenUsd: price(env.AI_OUTPUT_USD_PER_MTOK, 5) / 1e6,
            supportedCapabilities: ['text', 'json_object'],
        };
        return {
            modelId: model, spec, providerName,
            privacyUrl: env.AI_PRIVACY_URL?.trim() || KNOWN_PRIVACY[host] || null,
            createProvider: () => kind === 'anthropic'
                ? new AnthropicProvider(env.AI_API_KEY ?? '', fetch, baseUrl, providerName)
                : new OpenAICompatibleProvider(baseUrl, env.AI_API_KEY, providerName),
        };
    }

    const spec = DEEPSEEK_MODELS[env.DEEPSEEK_MODEL_ID ?? 'deepseek-flash'];
    const key = env.DEEPSEEK_API_KEY;
    if (!key || !spec) return null;
    return {
        modelId: spec.modelId, spec, providerName: 'DeepSeek',
        privacyUrl: KNOWN_PRIVACY['api.deepseek.com'],
        createProvider: () => new AnthropicProvider(key, fetch, DEEPSEEK_BASE_URL, 'deepseek'),
    };
}
