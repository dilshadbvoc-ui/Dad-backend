const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const calls = await prisma.interaction.findMany({
        where: {
            callStatus: { in: ['in_progress', 'initiated', 'IN_PROGRESS'] },
            type: 'call'
        },
        orderBy: { date: 'desc' },
        take: 20
    });
    
    console.log('Initiated/In Progress calls:');
    calls.forEach(c => {
        console.log(`- ID: ${c.id}, Phone: ${c.phoneNumber}, Status: ${c.callStatus}, UserID: ${c.createdById}, Date: ${c.date}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
