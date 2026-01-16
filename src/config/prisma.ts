// import { Pool, PoolConfig } from 'pg';
// import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

if (!globalForPrisma.prisma) {
    // const connectionString = process.env.DATABASE_URL;

    // Conditionally enable SSL based on connection string or environment
    // const useSSL = process.env.DATABASE_SSL === 'true' ||
    //    connectionString?.includes('sslmode=require');

    // const poolConfig: PoolConfig = {
    //     connectionString,
    //     max: 20,
    //     idleTimeoutMillis: 30000,
    //     connectionTimeoutMillis: 10000
    // };

    // if (useSSL) {
    //     // poolConfig.ssl = { rejectUnauthorized: false };
    // }

    // const pool = new Pool(poolConfig);
    // const adapter = new PrismaPg(pool);
    // @ts-ignore
    globalForPrisma.prisma = new PrismaClient();
}

export const prisma = globalForPrisma.prisma;
export default prisma;
