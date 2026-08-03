import prisma from '../config/prisma';

async function searchMetaId() {
    try {
        console.log("Searching for ID 1717133599615272 in all Meta leads...");
        const leads = await prisma.lead.findMany({
            where: { source: { in: ['meta_ads', 'meta_leadgen'] } },
            select: { sourceDetails: true, id: true, createdAt: true }
        });

        let found = false;
        let count = 0;
        let todayCount = 0;
        const startDate = new Date("2026-07-30T18:30:00.000Z");

        for (const lead of leads) {
            const str = JSON.stringify(lead.sourceDetails || {});
            if (str.includes("1717133599615272")) {
                found = true;
                count++;
                if (lead.createdAt >= startDate) {
                    todayCount++;
                }
            }
        }
        
        console.log(`Found ID in ${count} total leads.`);
        console.log(`Found ID in ${todayCount} leads created today.`);

        if (!found) {
            console.log("ID not found in any lead's sourceDetails.");
        }
    } finally {
        await prisma.$disconnect();
    }
}
searchMetaId();
