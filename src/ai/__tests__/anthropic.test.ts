import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../providers/anthropic';

describe('Anthropic transport', () => {
  const request = { modelId: 'claude-haiku-4-5-20251001', messages: [{ role: 'system' as const, content: 'instructions' }, { role: 'user' as const, content: 'packet' }], maxTokens: 800 };
  it('maps messages, usage, and abort signal without sending local user IDs', async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: request.modelId, stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 30, output_tokens: 10 } })));
    const signal = new AbortController().signal;
    const result = await new AnthropicProvider('throwaway', transport).generateText({ ...request, userId: 'private' }, { signal });
    expect(result.usage.totalTokens).toBe(40);
    expect(transport.mock.calls[0][1].signal).toBe(signal);
    const body = JSON.parse(transport.mock.calls[0][1].body);
    expect(body.system).toBe('instructions');
    expect(body.messages).toEqual([{ role: 'user', content: 'packet' }]);
    expect(JSON.stringify(body)).not.toContain('private');
  });
  it('never leaks vendor error bodies', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('sensitive echoed data', { status: 429 }));
    await expect(new AnthropicProvider('throwaway', transport).generateText(request)).rejects.toMatchObject({ message: 'AI service request failed', status: 429 });
  });
});
