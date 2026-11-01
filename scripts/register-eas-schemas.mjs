#!/usr/bin/env node
/** Manual operator action only. Default is a read-only dry run; --register sends transactions. */
import { createPublicClient, createWalletClient, encodePacked, http, keccak256, parseAbi, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const address = '0x4200000000000000000000000000000000000020';
const schemas = { EAS_PREREG_SCHEMA_UID: 'bytes32 preregistrationHash', EAS_RESULTS_SCHEMA_UID: 'bytes32 resultsHash' };
const abi = parseAbi([
    'function register(string schema, address resolver, bool revocable) returns (bytes32)',
    'function getSchema(bytes32 uid) view returns ((bytes32 uid, address resolver, bool revocable, string schema))',
]);
const register = process.argv.includes('--register');
const planned = Object.entries(schemas).map(([name, schema]) => ({ name, schema,
    uid: keccak256(encodePacked(['string', 'address', 'bool'], [schema, zeroAddress, false])) }));
if (!register) {
    console.log('Dry run: Base mainnet (8453), zero resolver, non-revocable hash-only schemas. No transaction sent.');
    for (const item of planned) console.log(`${item.name}=${item.uid} # ${item.schema}`);
    console.log('After reviewing, set BASE_RPC_URL + EAS_SIGNER_PRIVATE_KEY and run with --register.');
} else {
    if (!process.env.BASE_RPC_URL || !/^0x[0-9a-fA-F]{64}$/.test(process.env.EAS_SIGNER_PRIVATE_KEY || '')) throw new Error('Missing Base RPC or signer configuration');
    const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });
    if (await client.getChainId() !== base.id) throw new Error('RPC is not Base mainnet');
    const wallet = createWalletClient({ chain: base, transport: http(process.env.BASE_RPC_URL), account: privateKeyToAccount(process.env.EAS_SIGNER_PRIVATE_KEY) });
    for (const item of planned) {
        const current = await client.readContract({ address, abi, functionName: 'getSchema', args: [item.uid] });
        if (current.uid !== item.uid) {
            const hash = await wallet.writeContract({ address, abi, functionName: 'register', args: [item.schema, zeroAddress, false] });
            const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
            if (receipt.status !== 'success') throw new Error('Schema registration reverted');
        }
        console.log(`${item.name}=${item.uid}`);
    }
}
