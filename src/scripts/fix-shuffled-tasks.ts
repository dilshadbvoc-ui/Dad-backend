import prisma from '../config/prisma';

async function fixShuffledTasks() {
    console.log('[Fix] Starting one-time fix for existing shuffled tasks and follow-ups...');
    try {
        const tasks = await prisma.task.findMany({
            where: {
                leadId: { not: null },
                isDeleted: false,
                status: { notIn: ['completed'] }
            },
            include: { lead: true }
        });

        let taskFixCount = 0;
        for (const task of tasks) {
            if (task.lead && task.lead.assignedToId && task.assignedToId === task.lead.assignedToId && task.createdById !== task.lead.assignedToId) {
                await prisma.task.update({
                    where: { id: task.id },
                    data: { createdById: task.lead.assignedToId }
                });
                taskFixCount++;
            }
        }
        console.log(`[Fix] Updated ${taskFixCount} tasks.`);

        const followUps = await prisma.followUp.findMany({
            where: {
                leadId: { not: null },
                isDeleted: false,
                status: { notIn: ['completed'] }
            },
            include: { lead: true }
        });

        let followUpFixCount = 0;
        for (const fu of followUps) {
            if (fu.lead && fu.lead.assignedToId && fu.assignedToId === fu.lead.assignedToId && fu.createdById !== fu.lead.assignedToId) {
                await prisma.followUp.update({
                    where: { id: fu.id },
                    data: { createdById: fu.lead.assignedToId }
                });
                followUpFixCount++;
            }
        }
        console.log(`[Fix] Updated ${followUpFixCount} follow-ups.`);
        console.log('[Fix] One-time fix completed successfully!');
    } catch (error) {
        console.error('[Fix] Error running one-time fix:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixShuffledTasks();
