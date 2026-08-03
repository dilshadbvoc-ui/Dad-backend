import prisma from '../config/prisma';

async function checkRajithaLeads() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { id: true, organisationId: true }
        });

        if (!user || !user.organisationId) {
            console.log("User or Org ID not found.");
            return;
        }

        console.log(`User Org ID: ${user.organisationId}`);

        const startDate = new Date("2026-07-30T18:30:00.000Z"); // July 31st IST

        const leads = await prisma.lead.findMany({
            where: {
                organisationId: user.organisationId as string,
                createdAt: { gte: startDate }
            },
            select: { id: true, source: true, sourceDetails: true, createdAt: true, firstName: true }
        });

        console.log(`Total leads created for Rajitha's Org today: ${leads.length}`);
        
        let metaLeadCount = 0;

        for (const lead of leads) {
            if (lead.source === 'meta_ads' || lead.source === 'meta_leadgen') {
                metaLeadCount++;
                console.log(`- Lead: ${lead.firstName} | Source: ${lead.source} | CreatedAt: ${lead.createdAt.toISOString()}`);
                console.log(`  SourceDetails:`, JSON.stringify(lead.sourceDetails));
            }
        }
        
        console.log(`Total META leads today: ${metaLeadCount}`);

    } finally {
        await prisma.$disconnect();
    }
}
checkRajithaLeads();
