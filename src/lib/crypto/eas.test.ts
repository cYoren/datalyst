// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { zeroHash } from 'viem';
import { canonicalJson, EAS_DOMAIN, hashExperimentData, schemaUid, signSnapshot, verifySignedProof } from './eas';
import { verifyBundle } from './verify-bundle';

describe('EAS content integrity proofs (offline disposable keys)', () => {
    beforeEach(() => vi.stubEnv('EAS_SIGNER_PRIVATE_KEY', generatePrivateKey()));
    afterEach(() => vi.unstubAllEnvs());
    const plan = { format: 'datalyst-preregistration-v1', experimentId: 'synthetic', plan: { hypothesis: 'Example', analysis: { alpha: 0.05 } }, assignments: [{ date: '2026-10-01', condition: 'A' }] };
    it('hashes recursively with stable key ordering, retaining nested outcomes', () => {
        expect(hashExperimentData({ b: { x: 2, a: 1 }, a: [1, 2] })).toBe(hashExperimentData({ a: [1, 2], b: { a: 1, x: 2 } }));
        expect(hashExperimentData({ results: { n: 4 } })).not.toBe(hashExperimentData({ results: { n: 5 } }));
        expect(hashExperimentData({ results: [1, 2] })).not.toBe(hashExperimentData({ results: [2, 1] }));
        expect(() => canonicalJson({ mean: NaN })).toThrow();
        expect(() => canonicalJson({ missing: undefined })).toThrow();
    });
    it('uses independently derived non-revocable zero-resolver schema UIDs', () => {
        expect(schemaUid('PREREG')).toBe('0x0741aecd3e7acf996845d324f01b1be13a79148ff9c4d26f015c8652cbef94f6');
        expect(schemaUid('RESULTS')).toBe('0xf9819726ed8ec12d53b6d994673593f185dca5237c0e4ace0644eaf55eb4ae0a');
    });
    it('signs a portable V2 proof, detects altered content and signer', async () => {
        const proof = await signSnapshot('PREREG', plan);
        expect(proof.domain).toEqual(EAS_DOMAIN);
        expect(await verifySignedProof(JSON.parse(JSON.stringify(proof)), plan)).toBe(true);
        expect(await verifySignedProof(proof, { ...plan, plan: { hypothesis: 'Changed' } })).toBe(false);
        expect(await verifySignedProof({ ...proof, signer: privateKeyToAccount(generatePrivateKey()).address }, plan)).toBe(false);
        expect(await verifySignedProof({ ...proof, signature: `0x${'00'.repeat(65)}` }, plan)).toBe(false);
        expect(await verifySignedProof({ ...proof, uid: zeroHash }, plan)).toBe(false);
    });
    it('rejects a foreign domain, altered schema, or tampered reference', async () => {
        const proof = await signSnapshot('PREREG', plan);
        const wrongDomain = JSON.parse(JSON.stringify(proof)); wrongDomain.domain.chainId = 1;
        expect(await verifySignedProof(wrongDomain, plan)).toBe(false);
        expect(await verifySignedProof({ ...proof, message: { ...proof.message, schema: zeroHash } }, plan)).toBe(false);
        expect(await verifySignedProof({ ...proof, message: { ...proof.message, refUID: schemaUid('RESULTS') } }, plan)).toBe(false);
    });
    it('verifies the plan/result chain and rejects a re-signed unrelated plan', async () => {
        const prereg = await signSnapshot('PREREG', plan);
        const snapshot = { experimentId: 'synthetic', preregistrationHash: hashExperimentData(plan), observations: [{ value: 3 }] };
        const results = await signSnapshot('RESULTS', snapshot, prereg.uid);
        const record = (kind: 'PREREG' | 'RESULTS', data: unknown, proof: typeof prereg) => ({ kind, mode: 'offchain', snapshot: data, dataHash: hashExperimentData(data), uid: proof.uid, proof });
        const bundle = { format: 'datalyst-proof-bundle-v1', records: [record('PREREG', plan, prereg), record('RESULTS', snapshot, results)] };
        expect(await verifyBundle(bundle)).toHaveLength(2);
        const otherPlan = { ...plan, experimentId: 'unrelated' };
        const otherProof = await signSnapshot('PREREG', otherPlan);
        await expect(verifyBundle({ ...bundle, records: [record('PREREG', otherPlan, otherProof), bundle.records[1]] })).rejects.toThrow('link');
        await expect(verifyBundle({ ...bundle, records: [bundle.records[1]] })).rejects.toThrow('link');
        await expect(verifyBundle({ ...bundle, records: [bundle.records[0], bundle.records[0]] })).rejects.toThrow('stage');
    });
    it('signing is unavailable without keys while verification stays usable', async () => {
        const proof = await signSnapshot('PREREG', plan);
        vi.stubEnv('EAS_SIGNER_PRIVATE_KEY', '');
        await expect(signSnapshot('PREREG', plan)).rejects.toThrow('not configured');
        expect(await verifySignedProof(proof, plan)).toBe(true);
    });
});
