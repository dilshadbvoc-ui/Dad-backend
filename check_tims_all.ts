import prisma from './src/config/prisma';

async function main() {
    const email = 'tims.teammanageredpl@gmail.com';
    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        console.log(`User not found with email: ${email}`);
        return;
    }

    const opps = await prisma.opportunity.findMany({
        where: { ownerId: user.id, isDeleted: false },
        orderBy: { createdAt: 'desc' }
    });
    
    console.log(`User ${email} has ${opps.length} opportunities:`);
    opps.forEach(o => {
        console.log(`- ${o.name} [ID: ${o.id}] (Stage: ${o.stage})`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
