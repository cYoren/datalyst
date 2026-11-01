import { zeroAddress, zeroHash, type Hex } from 'viem';
import {
    baseClient, EAS_ABI, EAS_ADDRESS, hashExperimentData, schemaUid, verifySignedProof,
    type AttestationKind, type SignedProof,
} from './eas';

type RecordProof = { kind: AttestationKind; mode: string; snapshot: unknown; dataHash: string; uid: Hex; proof?: SignedProof };
export async function verifyBundle(bundle: { format: string; records: RecordProof[] }) {
    if (bundle.format !== 'datalyst-proof-bundle-v1' || !Array.isArray(bundle.records) || bundle.records.length < 1 || bundle.records.length > 2) throw new Error('Invalid proof bundle');
    const seen = new Set<string>();
    const verified = [];
    for (const record of bundle.records) {
        if (!['PREREG', 'RESULTS'].includes(record.kind) || seen.has(record.kind)) throw new Error('Invalid proof stage');
        seen.add(record.kind);
        const hash = hashExperimentData(record.snapshot);
        if (hash !== record.dataHash) throw new Error('Snapshot hash mismatch');
        if (record.mode === 'offchain') {
            if (!record.proof || record.proof.kind !== record.kind || record.proof.uid !== record.uid || !await verifySignedProof(record.proof, record.snapshot)) throw new Error('Signature is missing or invalid');
            verified.push({ kind: record.kind, mode: record.mode, uid: record.uid, signer: record.proof.signer, refUID: record.proof.message.refUID, time: record.proof.message.time });
        } else if (record.mode === 'onchain') {
            const client = baseClient();
            if (await client.getChainId() !== 8453) throw new Error('Verification RPC is not Base');
            const attestation = await client.readContract({ address: EAS_ADDRESS, abi: EAS_ABI, functionName: 'getAttestation', args: [record.uid] });
            if (attestation.uid === zeroHash || attestation.uid !== record.uid || attestation.schema !== schemaUid(record.kind) || attestation.data !== hash || attestation.revocationTime !== BigInt(0) || attestation.expirationTime !== BigInt(0) || attestation.recipient !== zeroAddress || attestation.revocable) throw new Error('Onchain attestation does not match');
            verified.push({ kind: record.kind, mode: record.mode, uid: record.uid, signer: attestation.attester, refUID: attestation.refUID, time: String(attestation.time) });
        } else throw new Error('Unknown attestation mode');
    }
    const prereg = verified.find(r => r.kind === 'PREREG');
    const results = verified.find(r => r.kind === 'RESULTS');
    if (prereg && prereg.refUID !== zeroHash) throw new Error('Unexpected preregistration reference');
    if (results) {
        const p = bundle.records.find(r => r.kind === 'PREREG');
        const r = bundle.records.find(r => r.kind === 'RESULTS');
        const ps = p?.snapshot as { experimentId?: string } | undefined;
        const rs = r?.snapshot as { experimentId?: string; preregistrationHash?: string } | undefined;
        if (!prereg || results.refUID !== prereg.uid || results.mode !== prereg.mode || results.signer.toLowerCase() !== prereg.signer.toLowerCase() || BigInt(results.time) < BigInt(prereg.time) || !ps?.experimentId || ps.experimentId !== rs?.experimentId || rs.preregistrationHash !== p?.dataHash) throw new Error('Results do not link to this preregistration');
    }
    return verified;
}
