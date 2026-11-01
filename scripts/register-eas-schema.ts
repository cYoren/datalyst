/**
 * Register EAS Schema on Base using viem directly
 * 
 * Run once to register the Datalyst attestation schema.
 * Save the returned schemaUID to your .env file.
 * 
 * Usage: npx tsx scripts/register-eas-schema.ts
 */

import { createWalletClient, createPublicClient, http, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Schema Registry on Base Mainnet
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020';

// Base Mainnet RPC
const RPC_URL = 'https://mainnet.base.org';

// The schema definition
const SCHEMA = 'bytes32 dataHash, string experimentId, string protocolId, uint64 timestamp';

// ABI for the register function
const SCHEMA_REGISTRY_ABI = [
    {
        name: 'register',
        type: 'function',
        inputs: [
            { name: 'schema', type: 'string' },
            { name: 'resolver', type: 'address' },
            { name: 'revocable', type: 'bool' },
        ],
        outputs: [{ name: '', type: 'bytes32' }],
        stateMutability: 'nonpayable',
    },
] as const;

async function main() {
    console.log('📝 Registering EAS Schema on Base Mainnet...\n');

    const privateKey = process.env.EAS_PRIVATE_KEY;
    if (!privateKey) {
        console.error('❌ EAS_PRIVATE_KEY not found in .env.local');
        process.exit(1);
    }

    // Create account and clients
    const account = privateKeyToAccount(privateKey as Hex);
    console.log(`👛 Wallet: ${account.address}`);

    const publicClient = createPublicClient({
        chain: base,
        transport: http(RPC_URL),
    });

    const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(RPC_URL),
    });

    // Check balance
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`💰 Balance: ${Number(balance) / 1e18} ETH`);

    if (balance === BigInt(0)) {
        console.error('❌ No balance on Base Mainnet');
        process.exit(1);
    }

    console.log(`\n📋 Schema: "${SCHEMA}"`);
    console.log('⏳ Submitting transaction...\n');

    try {
        // Send the register transaction
        const hash = await walletClient.writeContract({
            address: SCHEMA_REGISTRY_ADDRESS,
            abi: SCHEMA_REGISTRY_ABI,
            functionName: 'register',
            args: [SCHEMA, '0x0000000000000000000000000000000000000000', false],
        });

        console.log(`📤 Transaction hash: ${hash}`);
        console.log('⏳ Waiting for confirmation...');

        // Wait for transaction receipt
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status !== 'success') {
            console.error('❌ Transaction failed');
            process.exit(1);
        }

        // The schemaUID is emitted in the logs
        // For EAS, it's: keccak256(abi.encodePacked(schema, resolver, revocable))
        // But we can also get it from the first log topic
        const schemaUID = receipt.logs[0]?.topics[1];

        if (!schemaUID) {
            console.error('❌ Could not find schemaUID in logs');
            console.log('Logs:', receipt.logs);
            process.exit(1);
        }

        console.log('\n✅ Schema registered successfully!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Schema UID: ${schemaUID}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`\n📎 View on EAS Explorer:`);
        console.log(`   https://base.easscan.org/schema/view/${schemaUID}`);
        console.log(`\n📝 Add to your .env.local:`);
        console.log(`   EAS_SCHEMA_UID=${schemaUID}`);
    } catch (error) {
        console.error('❌ Failed to register schema:', error);
        process.exit(1);
    }
}

main();
