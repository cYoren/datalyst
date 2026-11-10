import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const logLevels: ('query' | 'error' | 'warn')[] = process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'];

const isWorker = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

// Workers cannot reuse a socket across requests, so each request gets its own client over Hyperdrive.
const requestClients = new WeakMap<object, PrismaClient>();

function workerClient() {
    const { env, ctx } = getCloudflareContext();
    let client = requestClients.get(ctx);
    if (!client) {
        const { connectionString } = (env as unknown as { HYPERDRIVE: { connectionString: string } }).HYPERDRIVE;
        client = new PrismaClient({ adapter: new PrismaPg({ connectionString, maxUses: 1 }), log: logLevels });
        requestClients.set(ctx, client);
    }
    return client;
}

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = isWorker
    ? new Proxy({} as PrismaClient, {
        get(_, property) {
            const client = workerClient();
            const value = Reflect.get(client, property);
            return typeof value === 'function' ? value.bind(client) : value;
        },
    })
    : globalForPrisma.prisma ?? new PrismaClient({ log: logLevels });

if (!isWorker && process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
