
import 'dotenv/config';
import prisma from './config/prisma';

async function debugAnalytics() {
    console.log('--- Debugging Analytics ---');
    try {
        // Mock finding an admin user to get an Org ID
        const admin = await prisma.user.findFirst({
            where: { role: 'super_admin' },
            include: { organisation: true }
        });

        if (!admin) {
            console.log('No super_admin found. Trying to find any user.');
        }

        const user = admin || await prisma.user.findFirst({ include: { organisation: true } });

        if (!user) {
            console.error('No users found in DB. Cannot test analytics.');
            return;
        }

        console.log(`Testing with User: ${user.firstName} ${user.lastName} (Role: ${user.role}, Org: ${user.organisationId})`);
        const orgId = user.organisationId;

        if (!orgId) {
            console.error('User has no organisation.');
            return;
        }

        // 1. Dashboard Stats
        console.log('\nTesting Dashboard Stats...');
        const totalLeads = await prisma.lead.count({ where: { organisationId: orgId, isDeleted: false } });
        const pipelineResult = await prisma.opportunity.aggregate({
            where: { organisationId: orgId },
            _sum: { amount: true }
        });
        console.log(`  Leads: ${totalLeads}, Pipeline: ${pipelineResult._sum.amount}`);

        // 2. Sales Chart
        console.log('\nTesting Sales Chart Query...');
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const wonOpportunities = await prisma.opportunity.findMany({
            where: {
                organisationId: orgId,
                stage: 'closed_won',
                OR: [
                    { closeDate: { gte: sixMonthsAgo } },
                    { updatedAt: { gte: sixMonthsAgo } }
                ]
            },
            select: { amount: true, closeDate: true, updatedAt: true }
        });
        console.log(`  Won Opps (Last 6m): ${wonOpportunities.length}`);
        wonOpportunities.forEach(o => {
            console.log(`    - Amount: ${o.amount}, Date: ${o.closeDate || o.updatedAt}`);
        });

        // 3. Lead Sources
        console.log('\nTesting Lead Sources GroupBy...');
        // Note: Prisma might throw if 'source' column contains values not in LeadSource enum
        const sourceStats = await prisma.lead.groupBy({
            by: ['source'],
            where: { organisationId: orgId, isDeleted: false },
            _count: { source: true }
        });
        console.log('  Source Stats:', sourceStats);

    } catch (error) {
        console.error('CRITICAL ERROR:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugAnalytics();
