const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findFirst({
        where: { email: 'safaedufolio@gmail.com' }
    });

    if (!user) {
        console.log("Safa not found");
        return;
    }

    const recentInteractions = await prisma.interaction.findMany({
        where: { createdById: user.id },
        orderBy: { date: 'desc' },
        take: 30
    });

    console.log(`Found ${recentInteractions.length} recent interactions for Safa.`);
    for (const int of recentInteractions) {
        console.log(`- ID: ${int.id} | Date: ${int.date.toISOString()} | Type: ${int.type} | Status: ${int.callStatus} | Duration: ${int.duration}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
