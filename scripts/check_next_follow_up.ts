import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const leadsWithFollowUp = await prisma.lead.findMany({
        where: { nextFollowUp: { not: null } },
        select: { id: true, nextFollowUp: true },
        take: 5
    });
    console.log("Leads with nextFollowUp:", leadsWithFollowUp);

    const activeFollowUps = await prisma.followUp.findMany({
        where: { status: { notIn: ['completed', 'deferred'] }, leadId: { not: null }, isDeleted: false },
        select: { id: true, leadId: true, dueDate: true },
        take: 5
    });
    console.log("Active FollowUps:", activeFollowUps);
}

main().catch(console.error).finally(() => prisma.$disconnect());
