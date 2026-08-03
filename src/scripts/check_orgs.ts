import prisma from '../config/prisma';

async function checkOrgsForMetaLeads() {
    try {
        const startDate = new Date("2026-07-30T18:30:00.000Z");

        const leads = await prisma.lead.findMany({
            where: {
                createdAt: { gte: startDate },
                source: { in: ['meta_ads', 'meta_leadgen'] }
            },
            select: { id: true, sourceDetails: true, organisationId: true, organisation: { select: { name: true } } }
        });

        console.log(`Total Meta leads today: ${leads.length}`);

        const orgCounts: Record<string, {name: string, count: number, adNames: Set<string>}> = {};

        for (const lead of leads) {
            const orgId = lead.organisationId;
            const orgName = lead.organisation?.name || 'Unknown';
            const details = lead.sourceDetails as any;
            const adName = details?.adName || 'Unknown Ad';

            if (!orgCounts[orgId]) {
                orgCounts[orgId] = { name: orgName, count: 0, adNames: new Set() };
            }
            
            orgCounts[orgId].count++;
            orgCounts[orgId].adNames.add(adName);
        }

        for (const orgId of Object.keys(orgCounts)) {
            const data = orgCounts[orgId];
            console.log(`\nOrg: ${data.name} (ID: ${orgId})`);
            console.log(`Total Leads: ${data.count}`);
            console.log(`Ad Names:`, Array.from(data.adNames));
        }

    } finally {
        await prisma.$disconnect();
    }
}
checkOrgsForMetaLeads();
