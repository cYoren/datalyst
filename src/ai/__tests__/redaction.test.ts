import { describe, it, expect } from 'vitest';
import { isSafeRunMetadata, looksSensitive, redactForLog } from '../redaction';
import { SENSITIVE_STRINGS } from './fixtures';
import { AiExecutionPolicy } from '../policy/runner';
import { FakeAiProvider } from '../providers/fake-provider';
import type { AiModelSpec } from '../providers/types';

const SPEC: AiModelSpec = {
    modelId: 'fake-model',
    provider: 'fake',
    displayName: 'Fake',
    contextWindow: 8000,
    maxOutputTokens: 512,
    costPerInputTokenUsd: 0.000001,
    costPerOutputTokenUsd: 0.000002,
    supportedCapabilities: ['text', 'json_object'],
};

describe('redaction', () => {
    it('recognises every shape that identifies a person or a credential', () => {
        for (const value of SENSITIVE_STRINGS) expect(looksSensitive(value)).toBe(true);
    });

    it('lets identifiers and numbers through', () => {
        for (const value of ['req_1731_ab12', 'fake-model', 'insights', 'ok', 'gpt-5-mini']) {
            expect(looksSensitive(value)).toBe(false);
        }
    });

    it('strips what it can when a line has to carry free text', () => {
        const line = redactForLog('failed for gustavo.marcelino@example.com via https://example.com/a?token=1 with sk-proj-abcdefghijklmnopqrstuvwxyz012345');
        expect(line).toContain('[email]');
        expect(line).toContain('[url]');
        expect(line).toContain('[secret]');
        expect(line).not.toContain('example.com');
    });

    it('strips every occurrence, not just the first', () => {
        const line = redactForLog('a@b.co and c@d.co, sk-proj-abcdefghijklmnopqrstuvwxyz012345 then dl_abcdefghijklmnopqrstuvwxyz012345');
        expect(line).not.toContain('a@b.co');
        expect(line).not.toContain('c@d.co');
        expect(line).not.toContain('sk-proj');
        expect(line).not.toContain('dl_abcdef');
    });

    it('strips a labelled credential, which no other pattern matches', () => {
        const line = redactForLog('login failed password=hunter2hunter2');
        expect(line).toContain('[credential]');
        expect(line).not.toContain('hunter2');
    });

    it('collapses a journal line to one short line', () => {
        const line = redactForLog('line one\n\nline two\t\t' + 'x'.repeat(400), 40);
        expect(line.length).toBe(40);
        expect(line).not.toContain('\n');
    });
});

describe('run metadata never carries a payload', () => {
    const prompt = `Log: ${SENSITIVE_STRINGS.join(' / ')}`;

    it('keeps a successful run safe', async () => {
        const seen: Record<string, unknown>[] = [];
        const policy = new AiExecutionPolicy({
            provider: new FakeAiProvider({ response: '{"values":[]}' }),
            allowlist: { 'fake-model': SPEC },
            onRunComplete: (metadata) => seen.push(metadata as unknown as Record<string, unknown>),
        });

        await policy.execute({
            modelId: 'fake-model',
            userId: 'user-1',
            messages: [{ role: 'user', content: prompt }],
        });

        expect(seen).toHaveLength(1);
        expect(isSafeRunMetadata(seen[0])).toBe(true);
        expect(JSON.stringify(seen[0])).not.toContain(SENSITIVE_STRINGS[0]);
        expect(JSON.stringify(seen[0])).not.toContain(SENSITIVE_STRINGS[4]);
    });

    it('keeps a failed run safe, including the error class', async () => {
        const seen: Record<string, unknown>[] = [];
        const provider = new FakeAiProvider({ errorSequence: [new Error(`boom ${SENSITIVE_STRINGS[0]}`)] });
        const policy = new AiExecutionPolicy({
            provider,
            allowlist: { 'fake-model': SPEC },
            retryOptions: { maxRetries: 0 },
            onRunComplete: (metadata) => seen.push(metadata as unknown as Record<string, unknown>),
        });

        await expect(policy.execute({
            modelId: 'fake-model',
            userId: 'user-1',
            messages: [{ role: 'user', content: prompt }],
        })).rejects.toBeTruthy();

        expect(seen).toHaveLength(1);
        expect(isSafeRunMetadata(seen[0])).toBe(true);
        expect(seen[0].success).toBe(false);
        expect(JSON.stringify(seen[0])).not.toContain('example.com');
    });

    it('rejects a metadata object that smuggled a message in', () => {
        expect(isSafeRunMetadata({ correlationId: 'req_1', note: prompt })).toBe(false);
        expect(isSafeRunMetadata({ correlationId: 'req_1', provider: 'fake', latencyMs: 12 })).toBe(true);
    });

    it('rejects short prose, not just long prose', () => {
        // The first version of this guard only caught long strings, so a four-word journal
        // line walked straight through.
        for (const note of ['chest pain again', 'panic attack at work', 'slept badly, chest hurt']) {
            expect(isSafeRunMetadata({ correlationId: 'req_1', note }), note).toBe(false);
        }
    });

    it('rejects a name in a field that is supposed to be an opaque id', () => {
        expect(isSafeRunMetadata({ userRef: 'Maria Silva' })).toBe(false);
        expect(isSafeRunMetadata({ userRef: 'usr_8f21c4' })).toBe(true);
    });

    it('inspects arrays instead of waving them through', () => {
        // `redactionSummary` is the field designed to describe what was removed, so it is the
        // one most likely to quote it.
        expect(isSafeRunMetadata({ redactionSummary: ['I had a panic attack'] })).toBe(false);
        expect(isSafeRunMetadata({ redactionSummary: ['email', 'secret'] })).toBe(true);
        expect(isSafeRunMetadata({ warnings: [{ note: 'chest pain again' }] })).toBe(false);
    });
});
