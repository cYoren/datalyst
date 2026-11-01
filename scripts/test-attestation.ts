/** Offline only. Uses a generated disposable signer and never sends a transaction. */
import { generatePrivateKey } from 'viem/accounts';
import { signSnapshot, verifySignedProof } from '../src/lib/crypto/eas';

async function main() {
    const previous = process.env.EAS_SIGNER_PRIVATE_KEY;
    try {
        process.env.EAS_SIGNER_PRIVATE_KEY = generatePrivateKey();
        const snapshot = { experimentId: 'synthetic', plan: { hypothesis: 'Offline fixture' } };
        const proof = await signSnapshot('PREREG', snapshot);
        if (!await verifySignedProof(proof, snapshot)) throw new Error('Offline signature verification failed');
        console.log('Offline EAS V2 signature verified with a disposable key. No transaction sent.');
    } finally {
        if (previous === undefined) delete process.env.EAS_SIGNER_PRIVATE_KEY;
        else process.env.EAS_SIGNER_PRIVATE_KEY = previous;
    }
}
void main();
