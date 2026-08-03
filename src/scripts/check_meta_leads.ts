import prisma from '../config/prisma';

async function checkMetaLeads() {
    try {
        console.log("Checking Meta Leads for Ad Account: 1717133599615272");
        
        const startDate = new Date("2026-07-30T18:30:00.000Z"); // July 31st 12:00 AM IST is July 30th 6:30 PM UTC

        const leads = await prisma.lead.findMany({
            where: {
                createdAt: {
                    gte: startDate
                },
                OR: [
                    { source: 'meta_ads' },
                    { source: 'meta_leadgen' }
                ]
            },
            select: {
                id: true,
                firstName: true,
                createdAt: true,
                source: true,
                sourceDetails: true,
                organisationId: true
            }
        });

        console.log(`Found ${leads.length} leads created after ${startDate.toISOString()} with Meta source.`);

        let matchCount = 0;
        for (const lead of leads) {
            const detailsStr = JSON.stringify(lead.sourceDetails || {});
            if (detailsStr.includes("1717133599615272")) {
                console.log(`- Lead matched: ${lead.firstName} (${lead.id}) created at ${lead.createdAt}`);
                matchCount++;
            }
        }

        console.log(`\nTotal matched for Ad Account 1717133599615272: ${matchCount}`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkMetaLeads();
