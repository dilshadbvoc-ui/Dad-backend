import prisma from '../config/prisma';

async function checkTotalMetaLeads() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true }
        });

        if (!user || !user.organisationId) return;

        const allMetaLeads = await prisma.lead.findMany({
            where: {
                organisationId: user.organisationId,
                source: { in: ['meta_ads', 'meta_leadgen'] }
            },
            select: { id: true, createdAt: true, source: true, firstName: true }
        });

        console.log(`Total Meta leads in DB for Rajitha's Org: ${allMetaLeads.length}`);
        
        const todayStart = new Date("2026-07-30T18:30:00.000Z"); // July 31st 12 AM IST
        
        let todayCount = 0;
        let pastCount = 0;
        for (const lead of allMetaLeads) {
            if (lead.createdAt >= todayStart) todayCount++;
            else pastCount++;
        }
        
        console.log(`Leads created today (>= July 31): ${todayCount}`);
        console.log(`Leads created before today (past): ${pastCount}`);
        
    } finally {
        await prisma.$disconnect();
    }
}
checkTotalMetaLeads();
