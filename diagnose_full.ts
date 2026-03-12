import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function diagnose() {
    try {
        console.log('--- COMPREHENSIVE DIAGNOSTIC START ---');
        
        // 1. Get all organisations
        const orgs = await prisma.organisation.findMany({ select: { id: true, name: true } });
        console.log('\nFound Organisations:');
        orgs.forEach(o => console.log(`  ${o.name} (${o.id})`));

        // 2. Sample Users from main orgs
        const users = await prisma.user.findMany({
            take: 10,
            include: { organisation: true }
        });
        console.log('\nRecent Users:');
        users.forEach(u => console.log(`  ${u.firstName} ${u.lastName} | Role: ${u.role} | Org: ${u.organisation?.name} (${u.organisationId}) | ID: ${u.id}`));

        // 3. Opportunities with explicit Org check
        const opps = await prisma.opportunity.findMany({
            take: 50,
            where: { isDeleted: false },
            select: {
                id: true,
                name: true,
                organisationId: true,
                ownerId: true,
                stage: true
            }
        });
        
        console.log(`\nOpportunities Count: ${opps.length}`);
        
        // Group opps by OrgID
        const oppsByOrg: Record<string, number> = {};
        opps.forEach(o => {
            oppsByOrg[o.organisationId] = (oppsByOrg[o.organisationId] || 0) + 1;
        });
        
        console.log('\nOpportunities by OrgID:');
        Object.entries(oppsByOrg).forEach(([id, count]) => {
            const org = orgs.find(o => o.id === id);
            console.log(`  ${org?.name || 'Unknown Org'} (${id}): ${count} deals`);
        });

        // 4. Hierarchy test for a specific user if possible
        const targetUser = users.find(u => u.role === 'admin' || u.role === 'manager');
        if (targetUser) {
            console.log(`\nTesting Hierarchy for User: ${targetUser.firstName} (${targetUser.id})`);
            // Simulating getVisibleUserIds logic
            const subordinates = await prisma.user.findMany({
                where: { reportsToId: targetUser.id },
                select: { id: true }
            });
            console.log(`  Subordinates count: ${subordinates.length}`);
        }

        console.log('\n--- COMPREHENSIVE DIAGNOSTIC END ---');
    } catch (error) {
        console.error('Diagnostic error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
