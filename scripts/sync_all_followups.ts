import { PrismaClient } from '../src/generated/client';
import { FollowUpService } from '../src/services/followUpService';
const prisma = new PrismaClient();

async function main() {
    console.log("Testing sync for lead:", 'bbbd207f-7692-42e3-96bc-9fb38ff0fbe8');
    await FollowUpService.syncLeadFollowUp('bbbd207f-7692-42e3-96bc-9fb38ff0fbe8');
    const lead = await prisma.lead.findUnique({
        where: { id: 'bbbd207f-7692-42e3-96bc-9fb38ff0fbe8' },
        select: { id: true, nextFollowUp: true }
    });
    console.log("After sync:", lead?.nextFollowUp);
}

main().catch(console.error).finally(() => prisma.$disconnect());
