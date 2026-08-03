const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'jaseera032@gmail.com' }
    });
    
    // Check follow-ups
    const followUps = await prisma.followUp.findMany({
        where: {
            assignedToId: user.id,
            dueDate: {
                gte: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // last 4 days
            }
        },
        orderBy: { dueDate: 'desc' }
    });
    
    console.log(`Found ${followUps.length} followups for Jaseera in last 4 days`);
    followUps.forEach(f => {
        console.log(`- FollowUp ID: ${f.id}, Status: ${f.status}, Date: ${f.dueDate}`);
    });
    
    // Check tasks
    const tasks = await prisma.task.findMany({
        where: {
            assignedToId: user.id,
            dueDate: {
                gte: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
            }
        },
        orderBy: { dueDate: 'desc' }
    });
    
    console.log(`Found ${tasks.length} tasks for Jaseera in last 4 days`);
    tasks.forEach(t => {
        console.log(`- Task ID: ${t.id}, Status: ${t.status}, Date: ${t.dueDate}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
