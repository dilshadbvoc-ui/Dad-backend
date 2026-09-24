const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findFirst({
        where: { email: { contains: 'ajeena' } }
    });
    console.log("User:", user?.email);
    
    if (user) {
        const calls = await prisma.interaction.findMany({
            where: { createdById: user.id, type: 'call' },
            orderBy: { date: 'desc' },
            take: 1
        });
        console.log("Most recent call date:", calls[0]?.date);
    }
}
main().finally(() => prisma.$disconnect());
