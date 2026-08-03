import prisma from '../config/prisma';

async function aggregateMetaLeads() {
    try {
        const startDate = new Date("2026-07-30T18:30:00.000Z");

        const leads = await prisma.lead.findMany({
            where: {
                createdAt: { gte: startDate },
                source: { in: ['meta_ads', 'meta_leadgen'] }
            },
            select: { sourceDetails: true, id: true }
        });

        console.log(`Total Meta leads since July 31st 12:00 AM: ${leads.length}`);

        const pageCounts: Record<string, number> = {};
        const campaignCounts: Record<string, number> = {};
        const adNameCounts: Record<string, number> = {};

        for (const lead of leads) {
            const details = lead.sourceDetails as any;
            if (details) {
                if (details.metaPageId) {
                    pageCounts[details.metaPageId] = (pageCounts[details.metaPageId] || 0) + 1;
                }
                if (details.campaignId) {
                    campaignCounts[details.campaignId] = (campaignCounts[details.campaignId] || 0) + 1;
                }
                if (details.adName) {
                    adNameCounts[details.adName] = (adNameCounts[details.adName] || 0) + 1;
                }
            }
        }

        console.log('\nPage IDs (Counts):', pageCounts);
        console.log('\nCampaign IDs (Counts):', campaignCounts);
        console.log('\nAd Names (Counts):', adNameCounts);

    } finally {
        await prisma.$disconnect();
    }
}
aggregateMetaLeads();
