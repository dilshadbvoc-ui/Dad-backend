// @ts-nocheck
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- Starting Verification ---');

    // 1. Create Organisation
    console.log('1. Creating Organisation...');
    const org = await prisma.organisation.upsert({
        where: { slug: 'test-org-prisma-adapter' },
        update: {},
        create: {
            name: 'Test Org Prisma Adapter',
            slug: 'test-org-prisma-adapter',
            domain: 'test-prisma-adapter.com'
        }
    });
    console.log('   Organisation created:', org.id);

    // 2. Create User
    console.log('2. Creating User...');
    const user = await prisma.user.upsert({
        where: { email: 'test.adapter@prisma.com' },
        update: {},
        create: {
            email: 'test.adapter@prisma.com',
            firstName: 'Adapter',
            lastName: 'Tester',
            password: 'hashed_placeholder',
            organisationId: org.id,
            role: 'admin'
        }
    });
    console.log('   User created:', user.id);

    // 3. Create Lead
    console.log('3. Creating Lead...');
    const lead = await prisma.lead.create({
        data: {
            firstName: 'Lead',
            lastName: 'Adapter',
            phone: '9999999999',
            email: 'lead.adapter@test.com',
            organisationId: org.id,
            assignedToId: user.id,
            status: 'new',
            source: 'manual'
        }
    });
    console.log('   Lead created:', lead.id);

    console.log('--- Verification Complete: SUCCESS ---');
}

main()
    .catch(e => {
        console.error('Verification Failed:', e);
        if (e.meta && e.meta.driverAdapterError && e.meta.driverAdapterError.cause) {
            console.error('Driver Cause:', JSON.stringify(e.meta.driverAdapterError.cause, null, 2));
        }
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
