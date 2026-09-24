import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function findFixedUsers() {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    
    // Find followups updated in the last 15 minutes
    const recentlyUpdated = await prisma.followUp.findMany({
        where: {
            updatedAt: { gte: fifteenMinsAgo },
            status: { notIn: ['completed', 'deferred'] }
        },
        include: {
            assignedTo: { select: { firstName: true, lastName: true } }
        }
    });

    const userCounts: Record<string, { name: string, count: number }> = {};

    recentlyUpdated.forEach(f => {
        if (f.assignedToId && f.assignedTo) {
            if (!userCounts[f.assignedToId]) {
                userCounts[f.assignedToId] = {
                    name: `${f.assignedTo.firstName} ${f.assignedTo.lastName || ''}`.trim(),
                    count: 0
                };
            }
            userCounts[f.assignedToId].count++;
        }
    });

    console.log(`Found ${recentlyUpdated.length} recently updated follow-ups.`);
    console.log('Users who got their follow-ups fixed:');
    
    Object.values(userCounts)
        .sort((a, b) => b.count - a.count)
        .forEach(u => {
            console.log(`- ${u.name}: ${u.count} follow-ups`);
        });
}

findFixedUsers().catch(console.error).finally(() => prisma.$disconnect());
