import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const followup = await prisma.followUp.findUnique({
        where: { id: 'fcd473e7-2478-4a42-b31e-3cfc8afe75af' },
        include: { createdBy: { select: { firstName: true } } }
    });
    console.log("FollowUp Details:", JSON.stringify(followup, null, 2));

    const history = await prisma.leadHistory.findMany({
        where: { leadId: 'bbbd207f-7692-42e3-96bc-9fb38ff0fbe8' },
        orderBy: { createdAt: 'desc' }
    });
    console.log("Lead History:", JSON.stringify(history, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
