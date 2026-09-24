import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function fixStuckFollowUps() {
    console.log('Fetching all pending follow-ups...');
    
    // Get all pending follow-ups with their lead's assignedToId
    const pendingFollowUps = await prisma.followUp.findMany({
        where: {
            isDeleted: false,
            status: { notIn: ['completed', 'deferred'] }
        },
        include: { lead: { select: { assignedToId: true } } }
    });
    
    let followUpFixCount = 0;
    
    for (const f of pendingFollowUps) {
        if (f.lead && f.lead.assignedToId && f.assignedToId !== f.lead.assignedToId) {
            await prisma.followUp.update({
                where: { id: f.id },
                data: { assignedToId: f.lead.assignedToId }
            });
            followUpFixCount++;
        }
    }
    
    console.log(`Fixed ${followUpFixCount} mismatched follow-ups.`);
    
    console.log('Fetching all pending tasks...');
    
    const pendingTasks = await prisma.task.findMany({
        where: {
            isDeleted: false,
            status: { notIn: ['completed'] }
        },
        include: { lead: { select: { assignedToId: true } } }
    });
    
    let taskFixCount = 0;
    
    for (const t of pendingTasks) {
        if (t.lead && t.lead.assignedToId && t.assignedToId !== t.lead.assignedToId) {
            await prisma.task.update({
                where: { id: t.id },
                data: { assignedToId: t.lead.assignedToId }
            });
            taskFixCount++;
        }
    }
    
    console.log(`Fixed ${taskFixCount} mismatched tasks.`);
}

fixStuckFollowUps().catch(console.error).finally(() => prisma.$disconnect());
