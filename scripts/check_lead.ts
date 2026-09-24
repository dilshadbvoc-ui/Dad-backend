import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const id = 'bbbd207f-7692-42e3-96bc-9fb38ff0fbe8';
    const lead = await prisma.lead.findUnique({
        where: { id },
        select: { id: true, nextFollowUp: true }
    });
    console.log("Lead nextFollowUp:", lead?.nextFollowUp);

    const followUps = await prisma.followUp.findMany({
        where: { leadId: id, isDeleted: false, status: { notIn: ['completed', 'deferred'] } }
    });
    console.log("FollowUps:", followUps.map(f => ({ id: f.id, dueDate: f.dueDate, status: f.status })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
