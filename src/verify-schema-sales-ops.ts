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
    console.log('--- Starting Sales & Ops Verification ---');

    // 1. Get Org & User (from previous step)
    const org = await prisma.organisation.findFirst();
    const user = await prisma.user.findFirst();

    if (!org || !user) {
        throw new Error('Org or User not found. Run verify-migration.ts first.');
    }
    console.log('Using Org:', org.id, 'User:', user.id);

    // 2. Create Account
    console.log('2. Creating Account...');
    const account = await prisma.account.create({
        data: {
            name: 'Acme Corp',
            type: 'prospect',
            organisationId: org.id,
            ownerId: user.id
        }
    });
    console.log('   Account created:', account.id);

    // 3. Create Opportunity
    console.log('3. Creating Opportunity...');
    const opportunity = await prisma.opportunity.create({
        data: {
            name: 'Big Deal',
            amount: 50000,
            stage: 'negotiation',
            accountId: account.id,
            organisationId: org.id,
            ownerId: user.id
        }
    });
    console.log('   Opportunity created:', opportunity.id);

    // 4. Create Task
    console.log('4. Creating Task...');
    const task = await prisma.task.create({
        data: {
            subject: 'Follow up call',
            priority: 'high',
            accountId: account.id, // Linking to Account
            assignedToId: user.id,
            organisationId: org.id
        }
    });
    console.log('   Task created:', task.id);

    // 5. Create Interaction (Call)
    console.log('5. Creating Interaction...');
    const interaction = await prisma.interaction.create({
        data: {
            type: 'call',
            subject: 'Initial discovery',
            direction: 'outbound',
            accountId: account.id, // Linking to Account
            createdById: user.id,
            organisationId: org.id
        }
    });
    console.log('   Interaction created:', interaction.id);

    console.log('--- Verification Complete: SUCCESS ---');
}

main()
    .catch(e => {
        console.error('Verification Failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
