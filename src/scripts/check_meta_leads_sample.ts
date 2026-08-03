import prisma from '../config/prisma';

async function checkMetaLeads() {
    try {
        const leads = await prisma.lead.findMany({
            where: { source: { in: ['meta_ads', 'meta_leadgen'] } },
            take: 3,
            select: { sourceDetails: true, id: true, firstName: true }
        });
        console.log(JSON.stringify(leads, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}
checkMetaLeads();
