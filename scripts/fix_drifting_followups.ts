import { PrismaClient } from '../src/generated/client';
import { FollowUpService } from '../src/services/followUpService';
const prisma = new PrismaClient();

async function main() {
    const driftingFollowUps = await prisma.followUp.findMany({
        where: {
            isDeleted: false,
            status: { notIn: ['completed', 'deferred'] },
            leadId: { not: null },
            lead: { nextFollowUp: null }
        },
        select: { leadId: true }
    });

    const uniqueLeadIds = [...new Set(driftingFollowUps.map(f => f.leadId).filter(Boolean))];

    console.log(`Found ${uniqueLeadIds.length} leads with active followups but null nextFollowUp.`);

    for (const leadId of uniqueLeadIds) {
        if (leadId) {
            await FollowUpService.syncLeadFollowUp(leadId);
        }
    }
    
    console.log("Successfully synced drifting follow-ups!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
