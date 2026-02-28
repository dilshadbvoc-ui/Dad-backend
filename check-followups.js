const { PrismaClient } = require('./dist/generated/client');
const prisma = new PrismaClient();

async function checkFollowUps() {
    try {
        // Check total tasks
        const totalTasks = await prisma.task.count();
        console.log('Total tasks:', totalTasks);

        // Check tasks with due dates
        const tasksWithDueDate = await prisma.task.count({
            where: {
                dueDate: { not: null },
                isDeleted: false
            }
        });
        console.log('Tasks with due dates (not deleted):', tasksWithDueDate);

        // Get some sample tasks
        const sampleTasks = await prisma.task.findMany({
            where: {
                dueDate: { not: null },
                isDeleted: false
            },
            take: 5,
            select: {
                id: true,
                subject: true,
                dueDate: true,
                assignedToId: true,
                createdById: true,
                organisationId: true,
                status: true
            }
        });
        
        console.log('\nSample tasks with due dates:');
        console.log(JSON.stringify(sampleTasks, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkFollowUps();
