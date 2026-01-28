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
    console.log('--- Starting Marketing Schema Verification ---');

    // 1. Get Org & User
    const org = await prisma.organisation.findFirst();
    const user = await prisma.user.findFirst();

    if (!org || !user) {
        throw new Error('Org or User not found. Run verify-migration.ts first.');
    }
    console.log('Using Org:', org.id, 'User:', user.id);

    // 2. Create EmailList
    console.log('2. Creating EmailList...');
    const emailList = await prisma.emailList.create({
        data: {
            name: 'Newsletter Subscribers',
            description: 'Main list',
            organisationId: org.id,
            createdById: user.id
        }
    });
    console.log('   EmailList created:', emailList.id);

    // 3. Create Campaign
    console.log('3. Creating Campaign...');
    const campaign = await prisma.campaign.create({
        data: {
            name: 'January Newsletter',
            subject: 'Happy New Year!',
            content: '<h1>Hello</h1>',
            status: 'draft',
            emailListId: emailList.id,
            organisationId: org.id,
            createdById: user.id
        }
    });
    console.log('   Campaign created:', campaign.id);

    // 4. Create Workflow
    console.log('4. Creating Workflow...');
    const workflow = await prisma.workflow.create({
        data: {
            name: 'Welcome Series',
            isActive: true,
            triggerEntity: 'Lead',
            triggerEvent: 'created',
            organisationId: org.id,
            createdById: user.id
        }
    });
    console.log('   Workflow created:', workflow.id);

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
