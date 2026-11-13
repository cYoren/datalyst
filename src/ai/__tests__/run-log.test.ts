import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logAiRun, unsafeRunCount } from '../run-log';
import type { AiRunMetadata } from '../providers/types';

const run: AiRunMetadata = {
    correlationId: 'req_1731_ab12',
    userId: 'user-1',
    provider: 'fake',
    modelId: 'fake-model',
    latencyMs: 120,
    success: true,
    attempts: 1,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCostUsd: 0.00001 },
};

describe('AI run logging', () => {
    let info: ReturnType<typeof vi.spyOn>;
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        info = vi.spyOn(console, 'info').mockImplementation(() => {});
        error = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        info.mockRestore();
        error.mockRestore();
    });

    it('writes identifiers and counts, never the payload', () => {
        logAiRun(run);
        expect(info).toHaveBeenCalledTimes(1);
        const written = JSON.stringify(info.mock.calls[0]);
        expect(written).toContain('req_1731_ab12');
        expect(written).toContain('fake-model');
        expect(written).not.toContain('messages');
        expect(written).not.toContain('panic');
    });

    it('drops metadata that fails the guard, and counts the drop', () => {
        const before = unsafeRunCount();
        // A runner that started putting a prompt into its metadata must not print it.
        logAiRun({ ...run, prompt: 'I had a panic attack after the third coffee' } as AiRunMetadata);
        expect(info).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
        // The refusal says nothing about the content it refused.
        expect(JSON.stringify(error.mock.calls[0])).not.toContain('panic');
        expect(unsafeRunCount()).toBe(before + 1);
    });
});
