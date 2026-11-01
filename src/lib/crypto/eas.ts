/** EAS V2 signatures commit to content integrity, not truth or medical validity. */
import { createHash, randomBytes } from 'node:crypto';
import {
    createPublicClient, createWalletClient, decodeEventLog, encodeAbiParameters,
    encodePacked, http, keccak256, parseAbi, stringToHex, verifyTypedData,
    zeroAddress, zeroHash, type Address, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

export const EAS_ADDRESS = '0x4200000000000000000000000000000000000021' as const;
export const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020' as const;
export const EAS_DOMAIN = { name: 'EAS Attestation', version: '1.0.1', chainId: 8453, verifyingContract: EAS_ADDRESS } as const;
export const SCHEMAS = { PREREG: 'bytes32 preregistrationHash', RESULTS: 'bytes32 resultsHash' } as const;
export type AttestationKind = keyof typeof SCHEMAS;
export type AttestationMode = 'offchain' | 'onchain';
export const OFFCHAIN_TYPES = { Attest: [
    { name: 'version', type: 'uint16' }, { name: 'schema', type: 'bytes32' },
    { name: 'recipient', type: 'address' }, { name: 'time', type: 'uint64' },
    { name: 'expirationTime', type: 'uint64' }, { name: 'revocable', type: 'bool' },
    { name: 'refUID', type: 'bytes32' }, { name: 'data', type: 'bytes' },
    { name: 'salt', type: 'bytes32' },
] } as const;
export const EAS_ABI = parseAbi([
    'function attest((bytes32 schema, (address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data) request) payable returns (bytes32)',
    'function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))',
    'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)',
]);
export const REGISTRY_ABI = parseAbi([
    'function getSchema(bytes32 uid) view returns ((bytes32 uid, address resolver, bool revocable, string schema))',
]);

/** Recursive canonical JSON. Arrays preserve order; non-JSON and non-finite values fail closed. */
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
    }
    throw new Error('Only finite JSON values can be attested');
}
export function hashExperimentData(data: unknown): Hex {
    return `0x${createHash('sha256').update(canonicalJson(data)).digest('hex')}`;
}
export function verifyDataHash(data: unknown, expectedHash: string): boolean {
    return hashExperimentData(data) === expectedHash;
}
export function schemaUid(kind: AttestationKind): Hex {
    return keccak256(encodePacked(['string', 'address', 'bool'], [SCHEMAS[kind], zeroAddress, false]));
}
export function getAttestationMode(): AttestationMode {
    const mode = process.env.ATTESTATION_MODE || 'offchain';
    if (mode !== 'offchain' && mode !== 'onchain') throw new Error('Invalid ATTESTATION_MODE');
    return mode;
}
export function getSigner() {
    const key = process.env.EAS_SIGNER_PRIVATE_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Attestation signing is not configured');
    return privateKeyToAccount(key as Hex);
}
export function baseClient() {
    if (!process.env.BASE_RPC_URL) throw new Error('Base RPC is not configured');
    return createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL, { timeout: 10_000, retryCount: 0 }) });
}

export interface SignedProof {
    format: 'datalyst-eas-v2';
    kind: AttestationKind;
    uid: Hex;
    signer: Address;
    domain: typeof EAS_DOMAIN;
    message: {
        version: 2; schema: Hex; recipient: Address; time: string; expirationTime: string;
        revocable: false; refUID: Hex; data: Hex; salt: Hex;
    };
    signature: Hex;
}
function typedMessage(proof: SignedProof) {
    return { ...proof.message, time: BigInt(proof.message.time), expirationTime: BigInt(proof.message.expirationTime) };
}
/** Matches Offchain.getOffchainUID in the EAS SDK, including UTF-8 schema encoding. */
export function offchainUid(message: SignedProof['message']): Hex {
    return keccak256(encodePacked(
        ['uint16', 'bytes', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'bytes32', 'uint32'],
        [2, stringToHex(message.schema), message.recipient, zeroAddress, BigInt(message.time), BigInt(message.expirationTime), false, message.refUID, message.data, message.salt, 0],
    ));
}
export async function signSnapshot(kind: AttestationKind, snapshot: unknown, refUID: Hex = zeroHash): Promise<SignedProof> {
    const account = getSigner();
    const message: SignedProof['message'] = {
        version: 2, schema: schemaUid(kind), recipient: zeroAddress,
        time: String(Math.floor(Date.now() / 1000)), expirationTime: '0', revocable: false,
        refUID, data: encodeAbiParameters([{ type: 'bytes32' }], [hashExperimentData(snapshot)]),
        salt: `0x${randomBytes(32).toString('hex')}`,
    };
    const proof: SignedProof = { format: 'datalyst-eas-v2', kind, uid: offchainUid(message), signer: account.address, domain: EAS_DOMAIN, message, signature: '0x' };
    proof.signature = await account.signTypedData({ domain: EAS_DOMAIN, types: OFFCHAIN_TYPES, primaryType: 'Attest', message: typedMessage(proof) });
    return proof;
}
export async function verifySignedProof(proof: SignedProof, snapshot: unknown): Promise<boolean> {
    try {
        if (proof.format !== 'datalyst-eas-v2' || !['PREREG', 'RESULTS'].includes(proof.kind)) return false;
        if (canonicalJson(proof.domain) !== canonicalJson(EAS_DOMAIN)) return false;
        const m = proof.message;
        if (m.version !== 2 || m.schema !== schemaUid(proof.kind) || m.recipient !== zeroAddress || m.expirationTime !== '0' || m.revocable !== false) return false;
        if (proof.kind === 'PREREG' && m.refUID !== zeroHash) return false;
        if (proof.kind === 'RESULTS' && m.refUID === zeroHash) return false;
        if (!/^\d+$/.test(m.time) || BigInt(m.time) > BigInt(Math.floor(Date.now() / 1000) + 300)) return false;
        if (m.data !== hashExperimentData(snapshot) || proof.uid !== offchainUid(m)) return false;
        return await verifyTypedData({ address: proof.signer, domain: EAS_DOMAIN, types: OFFCHAIN_TYPES, primaryType: 'Attest', message: typedMessage(proof), signature: proof.signature });
    } catch { return false; }
}

/** Only hashes enter contract calldata. No experiment text, IDs, or observations. */
export async function submitOnchain(kind: AttestationKind, snapshot: unknown, refUID: Hex = zeroHash): Promise<Hex> {
    const schema = schemaUid(kind);
    const configured = process.env[kind === 'PREREG' ? 'EAS_PREREG_SCHEMA_UID' : 'EAS_RESULTS_SCHEMA_UID'];
    if (configured?.toLowerCase() !== schema.toLowerCase()) throw new Error('Registered schema UID is not configured correctly');
    const client = baseClient();
    if (await client.getChainId() !== base.id) throw new Error('RPC must use Base mainnet');
    const registered = await client.readContract({ address: SCHEMA_REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getSchema', args: [schema] });
    if (registered.uid !== schema || registered.schema !== SCHEMAS[kind] || registered.revocable || registered.resolver !== zeroAddress) throw new Error('Schema is not registered on Base');
    if (refUID !== zeroHash) {
        const ref = await client.readContract({ address: EAS_ADDRESS, abi: EAS_ABI, functionName: 'getAttestation', args: [refUID] });
        if (ref.uid !== refUID || ref.schema !== schemaUid('PREREG') || ref.attester.toLowerCase() !== getSigner().address.toLowerCase()) throw new Error('Onchain results require an onchain preregistration by this signer');
    }
    const account = getSigner();
    const wallet = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL, { timeout: 10_000, retryCount: 0 }) });
    return wallet.writeContract({ address: EAS_ADDRESS, abi: EAS_ABI, functionName: 'attest', args: [{ schema, data: {
        recipient: zeroAddress, expirationTime: BigInt(0), revocable: false, refUID,
        data: hashExperimentData(snapshot), value: BigInt(0),
    } }] });
}
export async function confirmOnchain(txHash: Hex, kind: AttestationKind): Promise<Hex> {
    const receipt = await baseClient().waitForTransactionReceipt({ hash: txHash, confirmations: 2, timeout: 20_000 });
    if (receipt.status !== 'success') throw new Error('Attestation transaction reverted');
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== EAS_ADDRESS.toLowerCase()) continue;
        try {
            const event = decodeEventLog({ abi: EAS_ABI, data: log.data, topics: log.topics });
            if (event.eventName === 'Attested' && event.args.schemaUID === schemaUid(kind) && event.args.attester.toLowerCase() === getSigner().address.toLowerCase()) return event.args.uid;
        } catch { /* unrelated event */ }
    }
    throw new Error('No matching EAS event');
}
export function getAttestationExplorerUrl(uid: string): string {
    return `https://base.easscan.org/attestation/view/${encodeURIComponent(uid)}`;
}
