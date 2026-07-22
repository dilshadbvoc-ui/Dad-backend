import prisma from '../src/config/prisma';

async function checkDemoOrg() {
    try {
        const userEmail = 'demo@crm.com';
        const user = await prisma.user.findUnique({
            where: { email: userEmail }
        });

        if (!user) {
            console.log(`User ${userEmail} not found`);
            return;
        }

        if (!user.organisationId) {
            console.log(`User ${userEmail} does not belong to any organization.`);
            return;
        }

        const orgId = user.organisationId;
        console.log(`User ${userEmail} belongs to Organization ID: ${orgId}`);

        const totalLeads = await prisma.lead.count({
            where: { organisationId: orgId, isDeleted: false }
        });

        const byStatus = await prisma.lead.groupBy({
            by: ['status'],
            where: { organisationId: orgId, isDeleted: false },
            _count: { _all: true }
        });

        console.log(`\n=== LEAD STATS FOR ORG: ${orgId} ===`);
        console.log(`Total Active Leads: ${totalLeads}\n`);
        
        console.table(byStatus.map(s => ({ Status: s.status, Count: s._count._all })));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkDemoOrg();
