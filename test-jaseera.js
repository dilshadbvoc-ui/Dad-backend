const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'jaseera032@gmail.com' }
    });
    
    const calls = await prisma.interaction.findMany({
        where: {
            createdById: user.id,
            callStatus: { in: ['in_progress', 'initiated', 'IN_PROGRESS'] },
            type: 'call'
        },
        orderBy: { date: 'desc' }
    });
    
    console.log(`Found ${calls.length} initiated/in progress calls for Jaseera`);
    calls.forEach(c => {
        console.log(`- ID: ${c.id}, Phone: ${c.phoneNumber}, Status: ${c.callStatus}, Date: ${c.date}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
